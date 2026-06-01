using Microsoft.EntityFrameworkCore;
using Npgsql;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Teams;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/team.service.ts 1:1. Two notable shape details:
//   - Members are ordered by team_role priority (head_coach,
//     assistant_coach, team_manager) then by member name. Implemented via
//     a small in-DB-friendly CASE expression.
//   - The DB partial unique index `uq_team_head_coach` enforces "at most
//     one head_coach per team", but EF Core Power Tools mistakenly inferred
//     a 1-to-1 relationship from it (see Team.TeamMember singular nav). We
//     keep that quirk untouched and route every member query through the
//     TeamMembers DbSet directly — no navigation traversal anywhere.
internal sealed class TeamService(SportStockDbContext db) : ITeamService
{
    private static readonly HashSet<string> ValidGenders = new(StringComparer.Ordinal)
    {
        "Boys", "Girls", "Mixed",
    };

    private static readonly HashSet<string> ValidAgeGroups = new(StringComparer.Ordinal)
    {
        "U4","U5","U6","U7","U8","U9","U10","U11",
        "U12","U13","U14","U15","U16","U17","U18","U19","U20","U21","Adult",
    };

    private static readonly HashSet<string> ValidTeamRoles = new(StringComparer.Ordinal)
    {
        "head_coach", "assistant_coach", "team_manager",
    };

    public async Task<IReadOnlyList<TeamListItem>> ListAsync(Guid clubId, CancellationToken ct = default)
    {
        return await db.Teams
            .IgnoreQueryFilters()
            .Where(t => t.ClubId == clubId)
            .OrderBy(t => t.Name)
            .Select(t => new TeamListItem
            {
                Id = t.Id,
                ClubId = t.ClubId,
                Name = t.Name,
                Gender = t.Gender,
                AgeGroup = t.AgeGroup,
                CreatedAt = t.CreatedAt,
                UpdatedAt = t.UpdatedAt,
                MemberCount = db.TeamMembers.Count(tm => tm.TeamId == t.Id),
            })
            .ToListAsync(ct);
    }

    public async Task<TeamDetailResponse> GetAsync(Guid teamId, Guid clubId, CancellationToken ct = default)
    {
        var team = await LoadTeamAsync(teamId, clubId, ct);
        var response = MapTeam(team);
        response.Members = await FetchMembersAsync(teamId, ct);
        return response;
    }

    public async Task<TeamDetailResponse> CreateAsync(
        Guid clubId, CreateTeamRequest req, CancellationToken ct = default)
    {
        var name = req.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(name)) throw new AppException("name is required", 400);
        AssertGender(req.Gender);
        AssertAgeGroup(req.AgeGroup);

        var team = new Team
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            Name = name,
            Gender = req.Gender,
            AgeGroup = req.AgeGroup,
        };
        db.Teams.Add(team);
        await db.SaveChangesAsync(ct);

        var response = MapTeam(team);
        response.Members = Array.Empty<TeamMemberInfo>();
        return response;
    }

    public async Task<TeamDetailResponse> UpdateAsync(
        Guid teamId, Guid clubId, UpdateTeamRequest req, CancellationToken ct = default)
    {
        if (req.Gender is not null) AssertGender(req.Gender);
        if (req.AgeGroup is not null) AssertAgeGroup(req.AgeGroup);

        var team = await LoadTeamAsync(teamId, clubId, ct);
        if (req.Name is not null) team.Name = req.Name.Trim();
        if (req.Gender is not null) team.Gender = req.Gender;
        if (req.AgeGroup is not null) team.AgeGroup = req.AgeGroup;

        await db.SaveChangesAsync(ct);

        var response = MapTeam(team);
        response.Members = await FetchMembersAsync(teamId, ct);
        return response;
    }

    public async Task DeleteAsync(Guid teamId, Guid clubId, CancellationToken ct = default)
    {
        // FK on team_members.team_id is ON DELETE CASCADE in db-init.sql, so
        // a single DELETE clears member rows without a separate query.
        var rows = await db.Teams
            .IgnoreQueryFilters()
            .Where(t => t.Id == teamId && t.ClubId == clubId)
            .ExecuteDeleteAsync(ct);
        if (rows == 0) throw new AppException("Team not found", 404);
    }

    public async Task<TeamMemberInfo> AddMemberAsync(
        Guid teamId, Guid clubId, Guid userId, string teamRole, CancellationToken ct = default)
    {
        AssertTeamRole(teamRole);
        await AssertTeamBelongsToClubAsync(teamId, clubId, ct);

        var user = await db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId && u.ClubId == clubId && u.IsActive, ct);
        if (user is null) throw new AppException("User not found", 404);
        if (user.Role != UserRole.Coach)
            throw new AppException("Only coaches can be assigned to teams", 400);

        if (teamRole == "head_coach")
        {
            var hasHeadCoach = await db.TeamMembers
                .AnyAsync(tm => tm.TeamId == teamId && tm.TeamRole == "head_coach", ct);
            if (hasHeadCoach) throw new AppException("This team already has a Head Coach", 409);
        }

        var member = new TeamMember
        {
            Id = Guid.NewGuid(),
            TeamId = teamId,
            UserId = userId,
            TeamRole = teamRole,
        };
        db.TeamMembers.Add(member);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            // (team_id, user_id) unique constraint — same user added twice.
            throw new AppException("This coach is already a member of this team", 409);
        }

        return await FetchMemberInfoAsync(member.Id, ct);
    }

    public async Task<TeamMemberInfo> UpdateMemberRoleAsync(
        Guid teamId, Guid clubId, Guid userId, string teamRole, CancellationToken ct = default)
    {
        AssertTeamRole(teamRole);
        await AssertTeamBelongsToClubAsync(teamId, clubId, ct);

        if (teamRole == "head_coach")
        {
            var conflicting = await db.TeamMembers
                .Where(tm => tm.TeamId == teamId && tm.TeamRole == "head_coach" && tm.UserId != userId)
                .AnyAsync(ct);
            if (conflicting) throw new AppException("This team already has a Head Coach", 409);
        }

        var existing = await db.TeamMembers
            .FirstOrDefaultAsync(tm => tm.TeamId == teamId && tm.UserId == userId, ct);
        if (existing is null) throw new AppException("Team member not found", 404);

        existing.TeamRole = teamRole;
        await db.SaveChangesAsync(ct);

        return await FetchMemberInfoAsync(existing.Id, ct);
    }

    public async Task RemoveMemberAsync(
        Guid teamId, Guid clubId, Guid userId, CancellationToken ct = default)
    {
        await AssertTeamBelongsToClubAsync(teamId, clubId, ct);
        var rows = await db.TeamMembers
            .Where(tm => tm.TeamId == teamId && tm.UserId == userId)
            .ExecuteDeleteAsync(ct);
        if (rows == 0) throw new AppException("Team member not found", 404);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private async Task<Team> LoadTeamAsync(Guid teamId, Guid clubId, CancellationToken ct)
    {
        var team = await db.Teams
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.Id == teamId && t.ClubId == clubId, ct);
        return team ?? throw new AppException("Team not found", 404);
    }

    private async Task AssertTeamBelongsToClubAsync(Guid teamId, Guid clubId, CancellationToken ct)
    {
        var exists = await db.Teams
            .IgnoreQueryFilters()
            .AnyAsync(t => t.Id == teamId && t.ClubId == clubId, ct);
        if (!exists) throw new AppException("Team not found", 404);
    }

    private async Task<IReadOnlyList<TeamMemberInfo>> FetchMembersAsync(Guid teamId, CancellationToken ct)
    {
        return await db.TeamMembers
            .IgnoreQueryFilters()
            .Where(tm => tm.TeamId == teamId)
            .Join(db.Users.IgnoreQueryFilters(), tm => tm.UserId, u => u.Id, (tm, u) => new
            {
                tm.Id,
                tm.UserId,
                tm.TeamRole,
                tm.CreatedAt,
                u.Name,
                u.Email,
                u.Phone,
            })
            // Map team_role to a sort key (1 = head_coach, 2 = assistant_coach, 3 = team_manager)
            // so the wire order matches Node's CASE expression exactly.
            .OrderBy(x => x.TeamRole == "head_coach"      ? 1
                       : x.TeamRole == "assistant_coach"  ? 2
                       : 3)
            .ThenBy(x => x.Name)
            .Select(x => new TeamMemberInfo
            {
                Id = x.Id,
                UserId = x.UserId,
                TeamRole = x.TeamRole,
                CreatedAt = x.CreatedAt,
                Name = x.Name,
                Email = x.Email,
                Phone = x.Phone,
            })
            .ToListAsync(ct);
    }

    private async Task<TeamMemberInfo> FetchMemberInfoAsync(Guid memberId, CancellationToken ct)
    {
        return await db.TeamMembers
            .IgnoreQueryFilters()
            .Where(tm => tm.Id == memberId)
            .Join(db.Users.IgnoreQueryFilters(), tm => tm.UserId, u => u.Id, (tm, u) => new TeamMemberInfo
            {
                Id = tm.Id,
                UserId = tm.UserId,
                TeamRole = tm.TeamRole,
                CreatedAt = tm.CreatedAt,
                Name = u.Name,
                Email = u.Email,
                Phone = u.Phone,
            })
            .FirstAsync(ct);
    }

    private static TeamDetailResponse MapTeam(Team t) => new()
    {
        Id = t.Id,
        ClubId = t.ClubId,
        Name = t.Name,
        Gender = t.Gender,
        AgeGroup = t.AgeGroup,
        CreatedAt = t.CreatedAt,
        UpdatedAt = t.UpdatedAt,
    };

    private static void AssertGender(string gender)
    {
        if (!ValidGenders.Contains(gender))
            throw new AppException(
                $"gender must be one of: {string.Join(", ", ValidGenders)}", 400);
    }

    private static void AssertAgeGroup(string ageGroup)
    {
        if (!ValidAgeGroups.Contains(ageGroup))
            throw new AppException(
                $"age_group must be one of: {string.Join(", ", ValidAgeGroups)}", 400);
    }

    private static void AssertTeamRole(string teamRole)
    {
        if (!ValidTeamRoles.Contains(teamRole))
            throw new AppException(
                $"team_role must be one of: {string.Join(", ", ValidTeamRoles)}", 400);
    }
}
