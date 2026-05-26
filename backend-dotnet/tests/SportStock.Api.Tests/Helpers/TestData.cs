using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Tests.Helpers;

// Shared fixture for tests that need pre-seeded users. The bcrypt hash is
// generated once with rounds=4 (cheap) to keep test setup fast — production
// uses rounds=10 but the hash format is identical, so AuthService.LoginAsync
// happily verifies our test passwords.
internal static class TestData
{
    public const string Password = "TestPass@123";
    public static readonly string PasswordHash =
        BCrypt.Net.BCrypt.HashPassword(Password, 4);

    public static async Task<Guid> CreateClubAsync(
        SportStockDbContext db,
        string name,
        bool isActive = true)
    {
        var club = new Club
        {
            Id = Guid.NewGuid(),
            Name = name,
            SportType = "Testing",
            ContactEmail = $"{Slug(name)}@test.com",
            IsActive = isActive,
        };
        db.Clubs.Add(club);
        await db.SaveChangesAsync();
        return club.Id;
    }

    public static async Task<Guid> CreateUserAsync(
        SportStockDbContext db,
        string email,
        Guid? clubId,
        UserRole role,
        string? passwordHash = null,
        bool emailVerified = true,
        bool isActive = true)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email.ToLowerInvariant(),
            PasswordHash = passwordHash ?? PasswordHash,
            Name = $"Test {role}",
            ClubId = clubId,
            Role = role,
            EmailVerified = emailVerified,
            IsActive = isActive,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    // Reset rows touched by a test class so it can run repeatedly without
    // manual DB cleanup between sessions. Runs in InitializeAsync.
    //
    // Order matters because of FK directions in db-init.sql:
    //   - clubs.id is referenced ON DELETE CASCADE from users, loans,
    //     write_off_orders, asset_categories, asset_names, asset_types.
    //   - asset_types.id is referenced ON DELETE RESTRICT from loan_items
    //     AND write_off_orders. So cascading "delete clubs" tries to delete
    //     asset_types, which fails if any active loan_item/write_off_order
    //     points to them.
    //   - loans.coach_id → users.id is also RESTRICT, blocking user delete.
    //
    // Strategy:
    //   1. Email verifications — independent string FK, drop by prefix.
    //   2. Write-off orders — must die before asset_types can be cascaded.
    //   3. Loans — cascades loan_items via loans.id ON DELETE CASCADE.
    //   4. Clubs — cascades the rest (users, asset catalog, teams, ...).
    //   5. Defensive user sweep — picks up super_admin / orphaned rows.
    public static async Task ResetAuthAsync(SportStockDbContext db, string emailPrefix, string clubNamePrefix)
    {
        await db.EmailVerifications
            .Where(v => v.Email.StartsWith(emailPrefix))
            .ExecuteDeleteAsync();

        var clubIds = await db.Clubs.IgnoreQueryFilters()
            .Where(c => c.Name.StartsWith(clubNamePrefix))
            .Select(c => c.Id)
            .ToListAsync();

        if (clubIds.Count > 0)
        {
            await db.WriteOffOrders.IgnoreQueryFilters()
                .Where(w => clubIds.Contains(w.ClubId))
                .ExecuteDeleteAsync();

            await db.Loans.IgnoreQueryFilters()
                .Where(l => clubIds.Contains(l.ClubId))
                .ExecuteDeleteAsync();

            await db.Clubs.IgnoreQueryFilters()
                .Where(c => clubIds.Contains(c.Id))
                .ExecuteDeleteAsync();
        }

        await db.Users.IgnoreQueryFilters()
            .Where(u => u.Email.StartsWith(emailPrefix))
            .ExecuteDeleteAsync();
    }

    private static string Slug(string name) =>
        new string(name.ToLowerInvariant().Where(c => char.IsLetterOrDigit(c)).ToArray());
}
