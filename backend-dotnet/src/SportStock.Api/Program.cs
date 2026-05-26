using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using FirebaseAdmin;
using FluentValidation;
using Google.Apis.Auth.OAuth2;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using Npgsql.NameTranslation;
using Serilog;
using SportStock.Api.Auth;
using SportStock.Api.Configuration;
using SportStock.Api.Data;
using SportStock.Api.Data.Enums;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;
using SportStock.Api.Middleware;

// ── Serilog bootstrap ────────────────────────────────────────────────────────
// Two-stage init: minimal logger now (so config-load errors surface as logs)
// then the full logger after configuration binds.
//
// NOTE: do NOT wrap the host build/run in a try/catch. WebApplicationFactory
// relies on an internal exception thrown by HostFactoryResolver to capture
// the IHost; swallowing it (even with a re-throw filter) is fragile across
// .NET versions and breaks integration tests. Let unhandled startup
// exceptions propagate — the runtime will print them with a stack trace.
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((ctx, services, lc) => lc
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext());

    // ── Strongly-typed options (fail-fast on missing required values) ────────
    builder.Services.AddOptions<DbOptions>()
        .Bind(builder.Configuration.GetSection(DbOptions.SectionName))
        .ValidateDataAnnotations()
        .ValidateOnStart();
    builder.Services.AddOptions<JwtOptions>()
        .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
        .ValidateDataAnnotations()
        .ValidateOnStart();
    builder.Services.AddOptions<SupabaseOptions>()
        .Bind(builder.Configuration.GetSection(SupabaseOptions.SectionName))
        .ValidateDataAnnotations()
        .ValidateOnStart();
    builder.Services.AddOptions<FirebaseOptions>()
        .Bind(builder.Configuration.GetSection(FirebaseOptions.SectionName))
        .ValidateDataAnnotations()
        .ValidateOnStart();
    builder.Services.Configure<ResendOptions>(
        builder.Configuration.GetSection(ResendOptions.SectionName));

    // ── PostgreSQL data source (registers PG enums Power Tools missed) ───────
    // Built lazily inside DI so WebApplicationFactory<Program> can inject the
    // Testcontainers connection string via ConfigureAppConfiguration BEFORE
    // the DataSource is constructed. Reading builder.Configuration here at
    // composition time would capture the placeholder value from
    // appsettings.json instead.
    builder.Services.AddSingleton<NpgsqlDataSource>(sp =>
    {
        var connStr = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<DbOptions>>()
                        .Value.ConnectionString;
        var dsb = new NpgsqlDataSourceBuilder(connStr);
        dsb.MapEnum<UserRole>("user_role", new NpgsqlSnakeCaseNameTranslator());
        dsb.MapEnum<AssetStatus>("asset_status", new NpgsqlSnakeCaseNameTranslator());
        dsb.MapEnum<LoanStatus>("loan_status", new NpgsqlSnakeCaseNameTranslator());
        dsb.MapEnum<WriteOffSource>("write_off_source", new NpgsqlSnakeCaseNameTranslator());
        dsb.MapEnum<StockMovementType>("stock_movement_type", new NpgsqlSnakeCaseNameTranslator());
        dsb.MapEnum<NotificationType>("notification_type", new NpgsqlSnakeCaseNameTranslator());
        dsb.EnableDynamicJson();
        return dsb.Build();
    });

    builder.Services.AddDbContextPool<SportStockDbContext>((sp, opt) =>
    {
        var ds = sp.GetRequiredService<NpgsqlDataSource>();
        var snake = new NpgsqlSnakeCaseNameTranslator();
        opt.UseNpgsql(ds, npg =>
        {
            // EF Core needs its own enum mapping in addition to what the
            // NpgsqlDataSourceBuilder did for the driver level. Without
            // these calls EF Core sends UserRole as int, which PG rejects
            // with 42804 "is of type user_role but expression is of type
            // integer".
            npg.MapEnum<UserRole>("user_role", nameTranslator: snake);
            npg.MapEnum<AssetStatus>("asset_status", nameTranslator: snake);
            npg.MapEnum<LoanStatus>("loan_status", nameTranslator: snake);
            npg.MapEnum<WriteOffSource>("write_off_source", nameTranslator: snake);
            npg.MapEnum<StockMovementType>("stock_movement_type", nameTranslator: snake);
            npg.MapEnum<NotificationType>("notification_type", nameTranslator: snake);
        });
        if (builder.Environment.IsDevelopment())
            opt.EnableSensitiveDataLogging();
    });

    // ── Cross-cutting services ───────────────────────────────────────────────
    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<ICurrentUser, CurrentUser>();

    // ── External integrations ────────────────────────────────────────────────
    builder.Services.AddHttpClient(SupabaseStorageClient.HttpClientName, (sp, client) =>
    {
        var opts = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<SupabaseOptions>>().Value;
        client.BaseAddress = new Uri($"{opts.Url.TrimEnd('/')}/storage/v1/");
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", opts.ServiceRoleKey);
    });
    builder.Services.AddSingleton<ISupabaseStorage, SupabaseStorageClient>();
    builder.Services.AddSingleton<IFcmClient, FcmClient>();
    builder.Services.AddScoped<IEmailSender, StubEmailSender>();

    // Firebase initialization once at startup. Wrapped in try/catch so dev
    // and test environments with stub credentials boot cleanly — IFcmClient
    // calls will fail at runtime if the creds aren't real, but tests replace
    // the registration with a spy via SportStockWebApplicationFactory.
    var firebaseOpts = builder.Configuration.GetSection(FirebaseOptions.SectionName).Get<FirebaseOptions>();
    if (firebaseOpts is not null
        && firebaseOpts.PrivateKey.Contains("BEGIN")
        && !string.IsNullOrWhiteSpace(firebaseOpts.ProjectId)
        && !string.IsNullOrWhiteSpace(firebaseOpts.ClientEmail))
    {
        try
        {
            var pem = firebaseOpts.PrivateKey.Replace("\\n", "\n");
            var credentialJson = JsonSerializer.Serialize(new
            {
                type = "service_account",
                project_id = firebaseOpts.ProjectId,
                private_key = pem,
                client_email = firebaseOpts.ClientEmail,
                token_uri = "https://oauth2.googleapis.com/token",
            });
            using var credentialStream = new MemoryStream(Encoding.UTF8.GetBytes(credentialJson));
            // GoogleCredential.FromStream is marked obsolete in favor of
            // CredentialFactory in recent Google.Apis.Auth, but the
            // deprecation notice is about loading from arbitrary user-supplied
            // JSON. We are assembling the JSON from typed FirebaseOptions
            // values that already passed startup validation, so the cited
            // security concern does not apply.
#pragma warning disable CS0618
            var googleCredential = GoogleCredential.FromStream(credentialStream);
#pragma warning restore CS0618
            FirebaseApp.Create(new AppOptions
            {
                Credential = googleCredential,
                ProjectId = firebaseOpts.ProjectId,
            });
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Firebase init failed — FCM disabled for this host.");
        }
    }
    else
    {
        Log.Warning("Firebase credentials missing or stubbed — FCM sends will fail at runtime.");
    }

    // ── FluentValidation (manual style, no auto-integration) ─────────────────
    builder.Services.AddValidatorsFromAssemblyContaining<Program>();

    // ── Application services ─────────────────────────────────────────────────
    builder.Services.AddScoped<SportStock.Api.Services.IAuthService, SportStock.Api.Services.AuthService>();
    builder.Services.AddScoped<SportStock.Api.Services.IClubService, SportStock.Api.Services.ClubService>();
    builder.Services.AddScoped<SportStock.Api.Services.IUserService, SportStock.Api.Services.UserService>();
    builder.Services.AddScoped<SportStock.Api.Services.ITeamService, SportStock.Api.Services.TeamService>();
    builder.Services.AddScoped<SportStock.Api.Services.IAssetNameService, SportStock.Api.Services.AssetNameService>();
    builder.Services.AddScoped<SportStock.Api.Services.IAssetService, SportStock.Api.Services.AssetService>();
    builder.Services.AddScoped<SportStock.Api.Services.IInventoryService, SportStock.Api.Services.InventoryService>();
    builder.Services.AddScoped<SportStock.Api.Services.ILoanService, SportStock.Api.Services.LoanService>();
    builder.Services.AddScoped<SportStock.Api.Services.INotificationService, SportStock.Api.Services.NoopNotificationService>();

    // ── JWT Bearer authentication ────────────────────────────────────────────
    // Same lazy-binding pattern as the DataSource: configure JwtBearerOptions
    // from IOptions<JwtOptions> at DI resolve time so test overrides applied
    // via ConfigureAppConfiguration land before SymmetricSecurityKey is built.
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer();

    builder.Services
        .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
        .Configure<Microsoft.Extensions.Options.IOptions<JwtOptions>>((opt, jwtOpts) =>
        {
            opt.RequireHttpsMetadata = false;
            opt.SaveToken = false;
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOpts.Value.Secret)),
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero,
            };
            // Surface 401/403 through ExceptionHandlingMiddleware so the JSON
            // shape is consistent with the rest of the API. Distinguish the
            // two failure modes the Node middleware also distinguishes:
            //   * "Missing Bearer token"     — no Authorization header
            //   * "Invalid or expired token" — header present but token bad
            const string FailedFlag = "jwt_auth_failed";
            opt.Events = new JwtBearerEvents
            {
                OnAuthenticationFailed = ctx =>
                {
                    ctx.HttpContext.Items[FailedFlag] = true;
                    return Task.CompletedTask;
                },
                OnChallenge = ctx =>
                {
                    ctx.HandleResponse();
                    var hadFailedToken = ctx.HttpContext.Items.ContainsKey(FailedFlag);
                    throw new AppException(
                        hadFailedToken ? "Invalid or expired token" : "Missing Bearer token",
                        401);
                },
            };
        });
    builder.Services.AddAuthorization();

    // ── Controllers + JSON ───────────────────────────────────────────────────
    builder.Services.AddControllers()
        .ConfigureApiBehaviorOptions(o =>
        {
            // Reshape automatic 400 ModelState responses so even malformed JSON
            // emits the standard { statusCode, error, message } shape.
            o.InvalidModelStateResponseFactory = ctx =>
            {
                var first = ctx.ModelState
                    .SelectMany(kv => kv.Value?.Errors ?? new())
                    .FirstOrDefault()?.ErrorMessage ?? "Invalid request body";
                throw new AppException(first, 400);
            };
        });
    builder.Services.ConfigureHttpJsonOptions(opt =>
    {
        opt.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
        opt.SerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
        opt.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        opt.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    });
    builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(opt =>
    {
        opt.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
        opt.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
        opt.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
        opt.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    });

    // ── Kestrel: cap request body to 1MB (mirrors express.json({limit:'1mb'})) ─
    builder.Services.Configure<KestrelServerOptions>(opt =>
    {
        opt.Limits.MaxRequestBodySize = 1_048_576;
    });

    // ── CORS (allow-all for local; tighten in production) ────────────────────
    builder.Services.AddCors(opt =>
    {
        opt.AddDefaultPolicy(p => p
            .AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader());
    });

    var app = builder.Build();

    // ── HTTP pipeline (order is intentional — see spec § 7) ──────────────────
    app.UseMiddleware<CorrelationIdMiddleware>();
    app.UseSerilogRequestLogging();
    app.UseMiddleware<ExceptionHandlingMiddleware>();
    app.UseMiddleware<SecurityHeadersMiddleware>();
    app.UseStatusCodePages(async ctx =>
    {
        var status = ctx.HttpContext.Response.StatusCode;
        if (status is 404)
            throw new AppException("Route not found", 404);
        if (status is 405)
            throw new AppException("Method not allowed", 405);
        await Task.CompletedTask;
    });
    app.UseCors();
    app.UseAuthentication();
    app.UseMiddleware<JwtUserResolutionMiddleware>();
    app.UseAuthorization();

    // Health endpoint shape MUST match the Node /health output 1:1.
    app.MapGet("/health", () => Results.Ok(new
    {
        status = "ok",
        timestamp = DateTime.UtcNow.ToString("o"),
    }));

    app.MapControllers();

    app.Run();
}

Log.CloseAndFlush();

// Visible to WebApplicationFactory<Program> in the test project.
public partial class Program { }
