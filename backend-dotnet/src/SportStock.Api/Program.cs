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
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
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
    var dbConnectionString = builder.Configuration[$"{DbOptions.SectionName}:ConnectionString"]
        ?? throw new InvalidOperationException("Db:ConnectionString not configured");

    var dataSourceBuilder = new NpgsqlDataSourceBuilder(dbConnectionString);
    dataSourceBuilder.MapEnum<UserRole>("user_role", new NpgsqlSnakeCaseNameTranslator());
    dataSourceBuilder.MapEnum<AssetStatus>("asset_status", new NpgsqlSnakeCaseNameTranslator());
    dataSourceBuilder.MapEnum<LoanStatus>("loan_status", new NpgsqlSnakeCaseNameTranslator());
    dataSourceBuilder.MapEnum<WriteOffSource>("write_off_source", new NpgsqlSnakeCaseNameTranslator());
    dataSourceBuilder.MapEnum<StockMovementType>("stock_movement_type", new NpgsqlSnakeCaseNameTranslator());
    dataSourceBuilder.MapEnum<NotificationType>("notification_type", new NpgsqlSnakeCaseNameTranslator());
    dataSourceBuilder.EnableDynamicJson();
    var dataSource = dataSourceBuilder.Build();

    builder.Services.AddDbContextPool<SportStockDbContext>(opt =>
    {
        opt.UseNpgsql(dataSource);
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

    // Firebase initialization once at startup. Skip in dev if creds are stubbed
    // so the dev loop doesn't require real Firebase credentials.
    var firebaseOpts = builder.Configuration.GetSection(FirebaseOptions.SectionName).Get<FirebaseOptions>();
    if (firebaseOpts is not null
        && !string.IsNullOrWhiteSpace(firebaseOpts.PrivateKey)
        && !string.IsNullOrWhiteSpace(firebaseOpts.ProjectId)
        && !string.IsNullOrWhiteSpace(firebaseOpts.ClientEmail))
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
        // CredentialFactory in recent Google.Apis.Auth, but the deprecation
        // notice is about loading from arbitrary user-supplied JSON. We are
        // assembling the JSON from typed FirebaseOptions values that already
        // passed startup validation, so the cited security concern does not
        // apply. Suppress until the FirebaseAdmin SDK exposes a non-obsolete
        // constructor path.
#pragma warning disable CS0618
        var googleCredential = GoogleCredential.FromStream(credentialStream);
#pragma warning restore CS0618
        FirebaseApp.Create(new AppOptions
        {
            Credential = googleCredential,
            ProjectId = firebaseOpts.ProjectId,
        });
    }
    else
    {
        Log.Warning("Firebase credentials missing — FCM sends will fail at runtime. " +
                    "Set Firebase__ProjectId / __ClientEmail / __PrivateKey to enable.");
    }

    // ── FluentValidation (manual style, no auto-integration) ─────────────────
    builder.Services.AddValidatorsFromAssemblyContaining<Program>();

    // ── JWT Bearer authentication ────────────────────────────────────────────
    var jwtSecret = builder.Configuration[$"{JwtOptions.SectionName}:Secret"]
        ?? throw new InvalidOperationException("Jwt:Secret not configured");

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(opt =>
        {
            opt.RequireHttpsMetadata = false;
            opt.SaveToken = false;
            opt.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero,
            };
            // Surface 401/403 through ExceptionHandlingMiddleware so the JSON
            // shape is consistent with the rest of the API.
            opt.Events = new JwtBearerEvents
            {
                OnChallenge = ctx =>
                {
                    ctx.HandleResponse();
                    throw new AppException("Invalid or expired token", 401);
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
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "Host terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

// Visible to WebApplicationFactory<Program> in the test project.
public partial class Program { }
