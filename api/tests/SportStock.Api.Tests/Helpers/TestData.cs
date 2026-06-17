using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Tests.Helpers;

// Shared fixture for tests that need pre-seeded data. The bcrypt hash is
// generated once with rounds=4 (cheap) to keep test setup fast — production
// uses rounds=10 but the hash format is identical, so AuthService.LoginAsync
// happily verifies our test passwords.
internal static class TestData
{
    public const string Password = "TestPass@123";
    public static readonly string PasswordHash =
        BCrypt.Net.BCrypt.HashPassword(Password, 4);

    // ── Club helpers ─────────────────────────────────────────────────────────

    /// <summary>Create a club with an explicit name (used by most existing tests).</summary>
    public static async Task<Guid> CreateClubAsync(
        SportStockDbContext db,
        string name,
        bool isActive = true)
    {
        var club = new Club
        {
            Id = Guid.NewGuid(),
            Name = name,
            ContactEmail = $"{Slug(name)}@test.com",
            IsActive = isActive,
            RetirementAlertMode = "percent",
        };
        db.Clubs.Add(club);
        await db.SaveChangesAsync();
        return club.Id;
    }

    /// <summary>
    /// Create a club owned by <paramref name="ownerId"/> with an auto-generated name.
    /// Used by middleware / multi-club tests that don't care about the club name.
    /// </summary>
    public static async Task<Guid> CreateClubAsync(
        SportStockDbContext db,
        Guid ownerId,
        string? name = null)
    {
        var clubName = name ?? $"Club_{Guid.NewGuid():N}";
        var club = new Club
        {
            Id = Guid.NewGuid(),
            Name = clubName,
            OwnerId = ownerId,
            ContactEmail = $"{Slug(clubName)}@test.com",
            IsActive = true,
            RetirementAlertMode = "percent",
        };
        db.Clubs.Add(club);
        await db.SaveChangesAsync();
        return club.Id;
    }

    // ── User helpers ─────────────────────────────────────────────────────────

    /// <summary>
    /// Create a platform-level user with no club affiliation.
    /// Club membership is added separately via <see cref="CreateMembershipAsync"/>.
    /// </summary>
    public static async Task<Guid> CreateUserAsync(
        SportStockDbContext db,
        string email,
        string? passwordHash = null,
        bool emailVerified = true,
        bool isActive = true)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email.ToLowerInvariant(),
            PasswordHash = passwordHash ?? PasswordHash,
            FirstName = "Test",
            LastName = "User",
            EmailVerified = emailVerified,
            IsActive = isActive,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    // ── Membership helpers ───────────────────────────────────────────────────

    /// <summary>Add an active ClubMembership for an existing user/club pair.</summary>
    public static async Task<Guid> CreateMembershipAsync(
        SportStockDbContext db,
        Guid clubId,
        Guid userId,
        ClubRole role,
        bool isActive = true)
    {
        var membership = new ClubMembership
        {
            Id = Guid.NewGuid(),
            ClubId = clubId,
            UserId = userId,
            Role = role,
            IsActive = isActive,
            JoinedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
        };
        db.ClubMemberships.Add(membership);
        await db.SaveChangesAsync();
        return membership.Id;
    }

    // Reset rows touched by a test class so it can run repeatedly without
    // manual DB cleanup between sessions. Runs in InitializeAsync.
    //
    // Order matters because of FK directions in db-init.sql:
    //   - clubs.id is referenced ON DELETE CASCADE from users, loans,
    //     write_off_orders, stocktake_sessions, asset_categories,
    //     asset_names, asset_types.
    //   - asset_types.id is referenced ON DELETE RESTRICT from loan_items,
    //     write_off_orders, AND stocktake_items. So cascading "delete clubs"
    //     tries to delete asset_types, which fails if any of those still
    //     point to them.
    //   - loans.coach_id → users.id is also RESTRICT, blocking user delete.
    //
    // Strategy (every child of clubs that holds a RESTRICT pointer to
    // asset_types or users must die explicitly first):
    //   1. Email verifications — independent string FK, drop by prefix.
    //   2. Write-off orders — RESTRICT on asset_types.
    //   3. Stocktake sessions — cascades stocktake_items (which RESTRICT
    //      asset_types).
    //   4. Loans — cascades loan_items (RESTRICT asset_types) and contain
    //      RESTRICT pointer to users.
    //   5. Clubs — cascades the rest (users, asset catalog, teams, ...).
    //   6. Defensive user sweep — picks up super_admin / orphaned rows.
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

            await db.StocktakeSessions.IgnoreQueryFilters()
                .Where(s => clubIds.Contains(s.ClubId))
                .ExecuteDeleteAsync();

            await db.Loans.IgnoreQueryFilters()
                .Where(l => clubIds.Contains(l.ClubId))
                .ExecuteDeleteAsync();

            // Kits reference asset_types via kit_items (ON DELETE RESTRICT).
            // Delete kits explicitly (cascades to kit_items) before deleting
            // clubs, which would otherwise attempt to cascade-delete asset_types
            // while kit_items still hold a RESTRICT FK pointing at them.
            await db.Kits.IgnoreQueryFilters()
                .Where(k => clubIds.Contains(k.ClubId))
                .ExecuteDeleteAsync();

            await db.Clubs.IgnoreQueryFilters()
                .Where(c => clubIds.Contains(c.Id))
                .ExecuteDeleteAsync();
        }

        await db.Users.IgnoreQueryFilters()
            .Where(u => u.Email.StartsWith(emailPrefix))
            .ExecuteDeleteAsync();
    }

    // ── Asset item helpers ───────────────────────────────────────────────────

    /// <summary>Directly insert a single AssetItem row for integration test setup.</summary>
    public static async Task<Guid> CreateWarehouseAsync(
        SportStockDbContext db,
        Guid clubId,
        string name = "Main Warehouse")
    {
        var w = new Warehouse
        {
            Id      = Guid.NewGuid(),
            ClubId  = clubId,
            Name    = name,
            IsActive = true,
        };
        db.Warehouses.Add(w);
        await db.SaveChangesAsync();
        return w.Id;
    }

    public static async Task<Guid> CreateAssetItemAsync(
        SportStockDbContext db,
        Guid clubId,
        Guid assetTypeId,
        Guid warehouseId,
        AssetItemStatus status = AssetItemStatus.Available,
        string? serialNumber = null)
    {
        var item = new AssetItem
        {
            Id           = Guid.NewGuid(),
            ClubId       = clubId,
            AssetTypeId  = assetTypeId,
            WarehouseId  = warehouseId,
            Status       = status,
            SerialNumber = serialNumber,
        };
        db.AssetItems.Add(item);
        await db.SaveChangesAsync();
        return item.Id;
    }

    private static string Slug(string name) =>
        new string(name.ToLowerInvariant().Where(c => char.IsLetterOrDigit(c)).ToArray());
}
