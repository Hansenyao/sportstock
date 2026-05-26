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

    // Reset rows touched by AuthTests so the test class can run repeatedly
    // without manual DB cleanup between sessions. Runs in InitializeAsync.
    public static async Task ResetAuthAsync(SportStockDbContext db, string emailPrefix, string clubNamePrefix)
    {
        // Order matters — children before parents.
        var emails = await db.Users.IgnoreQueryFilters()
            .Where(u => u.Email.StartsWith(emailPrefix))
            .Select(u => u.Email)
            .ToListAsync();

        await db.EmailVerifications
            .Where(v => emails.Contains(v.Email))
            .ExecuteDeleteAsync();

        await db.Users.IgnoreQueryFilters()
            .Where(u => u.Email.StartsWith(emailPrefix))
            .ExecuteDeleteAsync();

        await db.Clubs.IgnoreQueryFilters()
            .Where(c => c.Name.StartsWith(clubNamePrefix))
            .ExecuteDeleteAsync();
    }

    private static string Slug(string name) =>
        new string(name.ToLowerInvariant().Where(c => char.IsLetterOrDigit(c)).ToArray());
}
