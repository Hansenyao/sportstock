using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Users;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;

namespace SportStock.Api.Services;

// V2 rewrite: users no longer carry ClubId or Role directly — membership is
// managed through the club_memberships table. All club-scoped user operations
// now join through ClubMembership.
//
// Preserved behaviours:
//   - Temp password hardcoded to "123456" until Resend wiring is restored.
//   - "Last active club_admin" demote is rejected with 409.
//   - super_admin is created out-of-band and is not returned here.
internal sealed class UserService(
    SportStockDbContext db,
    ILogger<UserService> log,
    ISupabaseStorage storage) : IUserService
{
    private static readonly ClubRole[] ClubRoles =
    {
        ClubRole.ClubAdmin,
        ClubRole.AssetManager,
        ClubRole.Coach,
    };

    // TODO: restore real temp-password generation before production
    private static string GenerateTempPassword() => "123456";

    public async Task<PaginatedResult<UserListItem>> ListAsync(
        Guid clubId,
        string? roleFilter,
        bool? isActiveFilter,
        int page,
        int limit,
        CancellationToken ct = default)
    {
        var safePage = page < 1 ? 1 : page;
        var safeLimit = limit < 1 ? 20 : limit;
        var offset = (safePage - 1) * safeLimit;

        var query = db.ClubMemberships
            .IgnoreQueryFilters()
            .Where(m => m.ClubId == clubId);

        if (TryParseRole(roleFilter, out var role))
            query = query.Where(m => m.Role == role);
        if (isActiveFilter is not null)
            query = query.Where(m => m.IsActive == isActiveFilter.Value);

        var total = await query.CountAsync(ct);

        var rows = await query
            .OrderBy(m => m.User.FirstName)
            .ThenBy(m => m.User.LastName)
            .Skip(offset)
            .Take(safeLimit)
            .Select(m => new UserListItem
            {
                Id = m.UserId,
                Name = m.User.FirstName + " " + m.User.LastName,
                Email = m.User.Email,
                Phone = m.User.Phone,
                Role = m.Role,
                IsActive = m.IsActive,
                CreatedAt = m.User.CreatedAt,
                AvatarUrl = m.User.AvatarUrl,
            })
            .ToListAsync(ct);

        return new PaginatedResult<UserListItem>
        {
            Data = rows,
            Total = total,
            Page = safePage,
            Limit = safeLimit,
        };
    }

    public async Task<UserDetailResponse> GetAsync(Guid userId, Guid clubId, CancellationToken ct = default)
    {
        var membership = await db.ClubMemberships
            .IgnoreQueryFilters()
            .Where(m => m.UserId == userId && m.ClubId == clubId)
            .Select(m => new UserDetailResponse
            {
                Id = m.UserId,
                Name = m.User.FirstName + " " + m.User.LastName,
                Email = m.User.Email,
                Phone = m.User.Phone,
                Role = m.Role,
                IsActive = m.IsActive,
                CreatedAt = m.User.CreatedAt,
                AvatarUrl = m.User.AvatarUrl,
            })
            .FirstOrDefaultAsync(ct);

        if (membership is null) throw new AppException("User not found", 404);

        membership.Teams = await db.TeamMembers
            .IgnoreQueryFilters()
            .Where(tm => tm.UserId == userId)
            .OrderBy(tm => tm.Team.Name)
            .Select(tm => new UserTeamMembership
            {
                TeamId = tm.TeamId,
                TeamRole = tm.TeamRole,
                TeamName = tm.Team.Name,
                Gender = tm.Team.Gender,
                AgeGroup = tm.Team.AgeGroup,
            })
            .ToListAsync(ct);

        return membership;
    }

    public async Task<UserListItem> CreateAsync(
        Guid clubId, CreateUserRequest req, CancellationToken ct = default)
    {
        var roleName = req.Role ?? "coach";
        if (!TryParseRole(roleName, out var role) || !ClubRoles.Contains(role))
            throw new AppException("Invalid role", 400);

        var emailNormalized = req.Email.Trim().ToLowerInvariant();

        // Check if user already exists (platform-wide)
        var existingUser = await db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == emailNormalized, ct);

        User user;
        if (existingUser is not null)
        {
            // User already exists; just add them to this club if not already a member
            var alreadyMember = await db.ClubMemberships
                .IgnoreQueryFilters()
                .AnyAsync(m => m.UserId == existingUser.Id && m.ClubId == clubId, ct);
            if (alreadyMember)
                throw new AppException("This user is already a member of this club", 409);
            user = existingUser;
        }
        else
        {
            // Create new platform user
            var tempPassword = GenerateTempPassword();
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword, 10);

            // Parse name from req.Name (split on first space)
            var nameParts = (req.Name ?? "").Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            var firstName = nameParts.Length > 0 ? nameParts[0] : req.Name?.Trim() ?? string.Empty;
            var lastName = nameParts.Length > 1 ? nameParts[1] : string.Empty;

            user = new User
            {
                Id = Guid.NewGuid(),
                Email = emailNormalized,
                PasswordHash = passwordHash,
                FirstName = firstName,
                LastName = lastName,
                Phone = req.Phone,
                EmailVerified = true,
                IsActive = true,
            };
            db.Users.Add(user);
            await db.SaveChangesAsync(ct);

            log.LogWarning(
                "EMAIL STUB (welcome): would send temp password {TempPassword} to {Email}",
                tempPassword, emailNormalized);
        }

        // Create club membership
        var membership = new ClubMembership
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            UserId = user.Id,
            Role = role,
            IsActive = true,
            JoinedAt = DateTime.UtcNow,
        };
        db.ClubMemberships.Add(membership);
        await db.SaveChangesAsync(ct);

        return new UserListItem
        {
            Id = user.Id,
            Name = user.FirstName + " " + user.LastName,
            Email = user.Email,
            Phone = user.Phone,
            Role = role,
            IsActive = true,
            CreatedAt = user.CreatedAt,
            AvatarUrl = user.AvatarUrl,
        };
    }

    public async Task<UserListItem> UpdateAsync(
        Guid targetId, Guid clubId, UpdateUserRequest req, CancellationToken ct = default)
    {
        ClubRole? newRole = null;
        if (req.Role is not null)
        {
            if (!TryParseRole(req.Role, out var parsed) || !ClubRoles.Contains(parsed))
                throw new AppException("Invalid role", 400);
            newRole = parsed;
        }

        if (newRole is ClubRole r && r != ClubRole.ClubAdmin)
        {
            var otherActiveAdmins = await db.ClubMemberships
                .IgnoreQueryFilters()
                .CountAsync(m => m.ClubId == clubId
                                && m.Role == ClubRole.ClubAdmin
                                && m.IsActive
                                && m.UserId != targetId, ct);
            if (otherActiveAdmins == 0)
                throw new AppException("Cannot demote the last club admin", 409);
        }

        var membership = await db.ClubMemberships
            .IgnoreQueryFilters()
            .Include(m => m.User)
            .FirstOrDefaultAsync(m => m.UserId == targetId && m.ClubId == clubId, ct);
        if (membership is null) throw new AppException("User not found", 404);

        if (req.Name is not null)
        {
            var nameParts = req.Name.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            membership.User.FirstName = nameParts.Length > 0 ? nameParts[0] : req.Name.Trim();
            membership.User.LastName = nameParts.Length > 1 ? nameParts[1] : string.Empty;
        }
        if (req.Phone is not null) membership.User.Phone = req.Phone;
        if (newRole is not null) membership.Role = newRole.Value;

        await db.SaveChangesAsync(ct);

        return new UserListItem
        {
            Id = membership.UserId,
            Name = membership.User.FirstName + " " + membership.User.LastName,
            Email = membership.User.Email,
            Phone = membership.User.Phone,
            Role = membership.Role,
            IsActive = membership.IsActive,
            CreatedAt = membership.User.CreatedAt,
            AvatarUrl = membership.User.AvatarUrl,
        };
    }

    public async Task DeactivateAsync(
        Guid targetId, Guid clubId, Guid requesterId, CancellationToken ct = default)
    {
        if (targetId == requesterId)
            throw new AppException("You cannot deactivate your own account", 400);

        var rows = await db.ClubMemberships
            .IgnoreQueryFilters()
            .Where(m => m.UserId == targetId && m.ClubId == clubId)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsActive, false), ct);
        if (rows == 0) throw new AppException("User not found", 404);
    }

    public async Task<UploadAvatarResponse> UploadAvatarAsync(
        Guid userId, Guid clubId, Stream content,
        string contentType, string fileName, CancellationToken ct = default)
    {
        var ext = Path.GetExtension(fileName).TrimStart('.');
        var path = $"avatars/{clubId}/{userId}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{ext}";
        var url = await storage.UploadAsync(path, content, contentType, ct);

        await db.Users
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.AvatarUrl, url)
                .SetProperty(u => u.UpdatedAt, DateTime.UtcNow), ct);

        return new UploadAvatarResponse { AvatarUrl = url };
    }

    private static bool TryParseRole(string? value, out ClubRole role)
    {
        switch (value)
        {
            case "club_admin":    role = ClubRole.ClubAdmin;    return true;
            case "asset_manager": role = ClubRole.AssetManager; return true;
            case "coach":         role = ClubRole.Coach;        return true;
            case "accountant":    role = ClubRole.Accountant;   return true;
            default:              role = default;               return false;
        }
    }
}
