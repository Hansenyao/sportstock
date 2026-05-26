using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Users;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

// Ports backend/src/services/user.service.ts 1:1. Notable preserved quirks:
//   - Temp password hardcoded to "123456" until Resend wiring is restored
//     (matches the same TODO in AuthService.GenerateCode).
//   - club_admin / asset_manager / coach are the only roles a club member
//     can be created with or updated to. super_admin lives outside the club
//     and is created out-of-band by ops.
//   - "Last active club_admin" demote is rejected with 409 so accidental
//     role flips do not orphan a club.
internal sealed class UserService(
    SportStockDbContext db,
    ILogger<UserService> log) : IUserService
{
    private static readonly UserRole[] ClubRoles =
    {
        UserRole.ClubAdmin,
        UserRole.AssetManager,
        UserRole.Coach,
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

        var query = db.Users.IgnoreQueryFilters().Where(u => u.ClubId == clubId);

        if (TryParseRole(roleFilter, out var role))
            query = query.Where(u => u.Role == role);
        if (isActiveFilter is not null)
            query = query.Where(u => u.IsActive == isActiveFilter.Value);

        var total = await query.CountAsync(ct);

        var rows = await query
            .OrderBy(u => u.Name)
            .Skip(offset)
            .Take(safeLimit)
            .Select(u => new UserListItem
            {
                Id = u.Id,
                Name = u.Name,
                Email = u.Email,
                Phone = u.Phone,
                Role = u.Role,
                IsActive = u.IsActive,
                CreatedAt = u.CreatedAt,
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
        var user = await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == userId && u.ClubId == clubId)
            .Select(u => new UserDetailResponse
            {
                Id = u.Id,
                Name = u.Name,
                Email = u.Email,
                Phone = u.Phone,
                Role = u.Role,
                IsActive = u.IsActive,
                CreatedAt = u.CreatedAt,
            })
            .FirstOrDefaultAsync(ct);

        if (user is null) throw new AppException("User not found", 404);

        user.Teams = await db.TeamMembers
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

        return user;
    }

    public async Task<UserListItem> CreateAsync(
        Guid clubId, CreateUserRequest req, CancellationToken ct = default)
    {
        var roleName = req.Role ?? "coach";
        if (!TryParseRole(roleName, out var role) || !ClubRoles.Contains(role))
            throw new AppException("Invalid role", 400);

        var emailNormalized = req.Email.Trim().ToLowerInvariant();

        var emailExists = await db.Users
            .IgnoreQueryFilters()
            .AnyAsync(u => u.Email == emailNormalized, ct);
        if (emailExists)
            throw new AppException("This email is already registered", 409);

        var tempPassword = GenerateTempPassword();
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword, 10);

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = emailNormalized,
            PasswordHash = passwordHash,
            Name = req.Name.Trim(),
            Phone = req.Phone,
            ClubId = clubId,
            Role = role,
            EmailVerified = true,
            IsActive = true,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        // TODO: send a real welcome email via Resend before production. Current
        // stub mirrors the AuthService.GenerateCode hardcoded path: just log
        // the temp password so dev consoles see it.
        log.LogWarning(
            "EMAIL STUB (welcome): would send temp password {TempPassword} to {Email}",
            tempPassword, emailNormalized);

        return new UserListItem
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Phone = user.Phone,
            Role = user.Role,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
        };
    }

    public async Task<UserListItem> UpdateAsync(
        Guid targetId, Guid clubId, UpdateUserRequest req, CancellationToken ct = default)
    {
        UserRole? newRole = null;
        if (req.Role is not null)
        {
            if (!TryParseRole(req.Role, out var parsed) || !ClubRoles.Contains(parsed))
                throw new AppException("Invalid role", 400);
            newRole = parsed;
        }

        if (newRole is UserRole r && r != UserRole.ClubAdmin)
        {
            var otherActiveAdmins = await db.Users
                .IgnoreQueryFilters()
                .CountAsync(u => u.ClubId == clubId
                                && u.Role == UserRole.ClubAdmin
                                && u.IsActive
                                && u.Id != targetId, ct);
            if (otherActiveAdmins == 0)
                throw new AppException("Cannot demote the last club admin", 409);
        }

        var user = await db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == targetId && u.ClubId == clubId, ct);
        if (user is null) throw new AppException("User not found", 404);

        if (req.Name is not null) user.Name = req.Name;
        if (req.Phone is not null) user.Phone = req.Phone;
        if (newRole is not null) user.Role = newRole.Value;

        await db.SaveChangesAsync(ct);

        return new UserListItem
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Phone = user.Phone,
            Role = user.Role,
            IsActive = user.IsActive,
            CreatedAt = user.CreatedAt,
        };
    }

    public async Task DeactivateAsync(
        Guid targetId, Guid clubId, Guid requesterId, CancellationToken ct = default)
    {
        if (targetId == requesterId)
            throw new AppException("You cannot deactivate your own account", 400);

        var rows = await db.Users
            .IgnoreQueryFilters()
            .Where(u => u.Id == targetId && u.ClubId == clubId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false), ct);
        if (rows == 0) throw new AppException("User not found", 404);
    }

    private static bool TryParseRole(string? value, out UserRole role)
    {
        switch (value)
        {
            case "super_admin":   role = UserRole.SuperAdmin;   return true;
            case "club_admin":    role = UserRole.ClubAdmin;    return true;
            case "asset_manager": role = UserRole.AssetManager; return true;
            case "coach":         role = UserRole.Coach;        return true;
            default:              role = default;               return false;
        }
    }
}
