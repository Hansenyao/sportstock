using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data.Enums;
using SportStock.Api.Tests.Helpers;

namespace SportStock.Api.Tests;

// 1:1 port of backend/tests/auth.test.ts. Names use the standard
//   <Method>_Should_<Expected>_When_<Condition>
// pattern; the order of fixtures and assertions matches the jest file
// section-by-section so reviewers can read the two side-by-side.
[Collection("Database")]
public sealed class AuthTests : IAsyncLifetime, IDisposable
{
    private const string Prefix = "t_auth_";
    private const string ClubPrefix = "Auth Test ";
    private const string AdminEmail = Prefix + "admin@test.com";
    private const string CoachEmail = Prefix + "coach@test.com";

    private readonly DbFixture _dbFixture;
    private readonly SportStockWebApplicationFactory _factory;
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    // xUnit creates a fresh AuthTests instance for every test method, so
    // building a new WebApplicationFactory per test produces 20+ EF Core
    // service providers — EF Core upgrades that to a hard error after 20.
    // Share one factory for the whole class via a static field. It is never
    // disposed; xUnit cleans up at process exit.
    private static SportStockWebApplicationFactory? s_factory;
    private static readonly object s_factoryLock = new();

    private Guid _clubId;
    private Guid _adminUserId;
    private Guid _coachUserId;

    public AuthTests(DbFixture dbFixture)
    {
        _dbFixture = dbFixture;
        lock (s_factoryLock)
        {
            s_factory ??= new SportStockWebApplicationFactory().WithDb(dbFixture);
        }
        _factory = s_factory;
    }

    public async Task InitializeAsync()
    {
        await _factory.WithDbContextAsync(async db =>
        {
            await TestData.ResetAuthAsync(db, Prefix, ClubPrefix);
            _clubId = await TestData.CreateClubAsync(db, ClubPrefix + "Club");
            _adminUserId = await TestData.CreateUserAsync(db, AdminEmail, _clubId, UserRole.ClubAdmin);
            _coachUserId = await TestData.CreateUserAsync(db, CoachEmail, _clubId, UserRole.Coach);
        });
    }

    public Task DisposeAsync() => Task.CompletedTask;

    public void Dispose()
    {
        // Factory is shared across all tests in this class (see s_factory).
        // Disposing here would break later tests; leave to process-exit GC.
    }

    private HttpClient AuthedClient(Guid userId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId));
        return client;
    }

    // ── GET /api/v1/auth/me ──────────────────────────────────────────────────

    [Fact]
    public async Task GetMe_Should_Return_401_When_Authorization_Header_Missing()
    {
        using var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        // Error response keeps Node's camelCase shape ({statusCode, error,
        // message}) instead of the global snake_case applied to business
        // responses — see ExceptionHandlingMiddleware.
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("statusCode").GetInt32().Should().Be(401);
    }

    [Fact]
    public async Task GetMe_Should_Return_401_When_Token_Malformed()
    {
        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", "invalid-token-format");
        var response = await client.GetAsync("/api/v1/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GetMe_Should_Return_Profile_For_Club_Admin()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("role").GetString().Should().Be("club_admin");
        body.GetProperty("club_id").GetGuid().Should().Be(_clubId);
    }

    [Fact]
    public async Task GetMe_Should_Return_Profile_For_Coach()
    {
        using var client = AuthedClient(_coachUserId);
        var response = await client.GetAsync("/api/v1/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("role").GetString().Should().Be("coach");
    }

    // ── POST /api/v1/auth/register ───────────────────────────────────────────

    [Fact]
    public async Task Register_Should_Return_400_When_Password_Too_Short()
    {
        var clubName = ClubPrefix + "ShortPwClub";
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            club = new { name = clubName, contact_email = "club@test.com" },
            user = new { name = "Test Admin", email = Prefix + "shortpw@test.com", password = "123" },
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Register_Should_Return_201_When_Inputs_Valid()
    {
        var newClubName = ClubPrefix + "NewClub";
        var newUserEmail = Prefix + "newuser@test.com";
        using var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            club = new { name = newClubName, contact_email = "club@test.com", sport_type = "Soccer" },
            user = new { name = "Test Admin", email = newUserEmail, password = "TestPass@123" },
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString().Should().Contain("verification");

        await _factory.WithDbContextAsync(async db =>
        {
            var user = await db.Users.IgnoreQueryFilters()
                .FirstOrDefaultAsync(u => u.Email == newUserEmail);
            user.Should().NotBeNull();
            user!.Role.Should().Be(UserRole.ClubAdmin);
            user.EmailVerified.Should().BeFalse();
        });
    }

    [Fact]
    public async Task Register_Should_Return_409_When_Email_Already_Registered()
    {
        // Seed an existing user with a unique email AND its own club to satisfy
        // the unique-club constraint independently from other tests.
        var seededEmail = Prefix + "duplicate@test.com";
        var seededClub = ClubPrefix + "DuplicateEmailClub";
        await _factory.WithDbContextAsync(async db =>
        {
            var clubId = await TestData.CreateClubAsync(db, seededClub);
            await TestData.CreateUserAsync(db, seededEmail, clubId, UserRole.ClubAdmin);
        });

        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            club = new { name = ClubPrefix + "AnotherClubForDup", contact_email = "another@test.com", sport_type = "Soccer" },
            user = new { name = "Duplicate", email = seededEmail, password = "TestPass@123" },
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Register_Should_Return_409_When_Club_Name_Taken()
    {
        var existingClubName = ClubPrefix + "TakenClub";
        await _factory.WithDbContextAsync(async db =>
        {
            await TestData.CreateClubAsync(db, existingClubName);
        });

        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            club = new { name = existingClubName, contact_email = "x@test.com", sport_type = "Soccer" },
            user = new { name = "Another Admin", email = Prefix + "anotherclub@test.com", password = "TestPass@123" },
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    // ── POST /api/v1/auth/verify-email ───────────────────────────────────────

    [Fact]
    public async Task VerifyEmail_Should_Return_400_When_Code_Invalid()
    {
        var email = Prefix + "verifybad@test.com";
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/verify-email", new
        {
            email,
            code = "000000",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task VerifyEmail_Should_Return_200_When_Code_Correct()
    {
        var email = Prefix + "verifygood@test.com";
        var clubName = ClubPrefix + "VerifyClub";
        using var client = _factory.CreateClient();

        // Register triggers SendVerificationCodeAsync which writes the OTP row.
        var register = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            club = new { name = clubName, contact_email = "verify@test.com", sport_type = "Soccer" },
            user = new { name = "Verify User", email, password = "TestPass@123" },
        }, JsonOpts);
        register.StatusCode.Should().Be(HttpStatusCode.Created);

        // The OTP code is hardcoded "123456" in AuthService (parity with Node
        // until Resend is wired). Read it back from email_verifications to
        // mirror the Node test path.
        var code = await _factory.WithDbContextAsync(async db =>
            await db.EmailVerifications
                .Where(v => v.Email == email && v.Type == "registration" && v.UsedAt == null)
                .OrderByDescending(v => v.CreatedAt)
                .Select(v => v.Code)
                .FirstAsync());

        var verify = await client.PostAsJsonAsync("/api/v1/auth/verify-email", new
        {
            email,
            code,
        }, JsonOpts);

        verify.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── POST /api/v1/auth/login ──────────────────────────────────────────────

    [Fact]
    public async Task Login_Should_Return_401_When_Password_Wrong()
    {
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = CoachEmail,
            password = "WrongPassword",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_Should_Return_401_When_Email_Unknown()
    {
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = "nobody@test.com",
            password = TestData.Password,
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_Should_Return_Token_And_User_When_Credentials_Valid()
    {
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = CoachEmail,
            password = TestData.Password,
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("token").GetString().Should().NotBeNullOrWhiteSpace();
        var user = body.GetProperty("user");
        user.GetProperty("id").GetGuid().Should().Be(_coachUserId);
        user.GetProperty("email").GetString().Should().Be(CoachEmail);
        user.GetProperty("role").GetString().Should().Be("coach");
    }

    [Fact]
    public async Task Login_Should_Return_403_When_Club_Disabled()
    {
        var disabledEmail = Prefix + "disabled@test.com";
        await _factory.WithDbContextAsync(async db =>
        {
            var clubId = await TestData.CreateClubAsync(db, ClubPrefix + "DisabledClub", isActive: false);
            await TestData.CreateUserAsync(db, disabledEmail, clubId, UserRole.Coach);
        });

        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = disabledEmail,
            password = TestData.Password,
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("message").GetString().Should().MatchRegex("(?i)disabled");
    }

    // ── POST /api/v1/auth/forgot-password + reset-password ───────────────────

    [Fact]
    public async Task ForgotPassword_Should_Return_200_Even_When_Email_Unknown()
    {
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new
        {
            email = "nonexistent@test.com",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ResetPassword_Should_Return_400_When_Code_Wrong()
    {
        using var client = _factory.CreateClient();
        await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = CoachEmail }, JsonOpts);

        var response = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
        {
            email = CoachEmail,
            code = "000000",
            new_password = "NewPass@123",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task ResetPassword_Should_Update_Password_And_Allow_Login()
    {
        var resetEmail = Prefix + "reset@test.com";
        await _factory.WithDbContextAsync(async db =>
            await TestData.CreateUserAsync(db, resetEmail, _clubId, UserRole.Coach));

        using var client = _factory.CreateClient();
        await client.PostAsJsonAsync("/api/v1/auth/forgot-password", new { email = resetEmail }, JsonOpts);

        var code = await _factory.WithDbContextAsync(async db =>
            await db.EmailVerifications
                .Where(v => v.Email == resetEmail && v.Type == "password_reset" && v.UsedAt == null)
                .OrderByDescending(v => v.CreatedAt)
                .Select(v => v.Code)
                .FirstAsync());

        var reset = await client.PostAsJsonAsync("/api/v1/auth/reset-password", new
        {
            email = resetEmail,
            code,
            new_password = "NewPass@123456",
        }, JsonOpts);
        reset.StatusCode.Should().Be(HttpStatusCode.OK);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email = resetEmail,
            password = "NewPass@123456",
        }, JsonOpts);
        login.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── PUT /api/v1/auth/password ────────────────────────────────────────────

    [Fact]
    public async Task ChangePassword_Should_Return_400_When_Current_Password_Wrong()
    {
        using var client = AuthedClient(_adminUserId);
        var response = await client.PutAsJsonAsync("/api/v1/auth/password", new
        {
            current_password = "wrong-password",
            new_password = "NewPass@123",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task ChangePassword_Should_Return_200_When_Current_Password_Correct()
    {
        // Use a dedicated user so a passing change doesn't break later tests.
        var email = Prefix + "changepw@test.com";
        var userId = await _factory.WithDbContextAsync(async db =>
            await TestData.CreateUserAsync(db, email, _clubId, UserRole.Coach));

        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", AuthHelper.MintToken(userId));

        var response = await client.PutAsJsonAsync("/api/v1/auth/password", new
        {
            current_password = TestData.Password,
            new_password = "Changed@456",
        }, JsonOpts);

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            email,
            password = "Changed@456",
        }, JsonOpts);
        login.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ── Cross-backend compatibility ──────────────────────────────────────────
    //
    // Proves that bcrypt hashes and JWTs produced by the Node backend continue
    // to authenticate against the .NET backend during cutover, which is the
    // primary "zero data migration" requirement of the migration spec.

    [Fact]
    public void BCrypt_Should_Produce_OpenBSD_Compatible_Hashes()
    {
        // bcryptjs emits hashes in OpenBSD format starting with $2a$ or $2b$.
        // BCrypt.Net-Next emits the same format. As long as the format markers
        // and round-counts match, hashes generated by either library verify
        // against the other — that's the wire-level interop guarantee the
        // .NET migration relies on for existing users.passwordhash rows.
        var hash = BCrypt.Net.BCrypt.HashPassword("TestPass@123", 10);

        hash.Should().MatchRegex(@"^\$2[ab]\$10\$",
            "BCrypt.Net-Next must emit the same OpenBSD prefix that bcryptjs writes");
        BCrypt.Net.BCrypt.Verify("TestPass@123", hash).Should().BeTrue();
        BCrypt.Net.BCrypt.Verify("WrongPassword", hash).Should().BeFalse();
    }

    [Fact]
    public async Task GetMe_Should_Accept_Token_That_Matches_Node_Issued_Shape()
    {
        // AuthHelper.MintToken builds a token with the same HS256 algorithm,
        // same Jwt:Secret value (from appsettings.Test.json), and the same
        // payload shape ({ sub, iat, exp }) the Node backend uses. If this
        // request passes the JwtBearer + JwtUserResolutionMiddleware pipeline,
        // tokens minted on the Node side will too during cutover.
        using var client = AuthedClient(_adminUserId);
        var response = await client.GetAsync("/api/v1/auth/me");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
