using Npgsql;
using Testcontainers.PostgreSql;

namespace SportStock.Api.Tests.Helpers;

// Database fixture for integration tests. Operates in two modes:
//
//   1. EXTERNAL — if env var TEST_DATABASE_URL is set, connect to that
//      Postgres instance and skip both Testcontainers and db-init.sql
//      replay (the external DB is expected to already have the schema
//      applied; tests rely on per-class prefix isolation for cleanup).
//      Convenient on dev machines without Docker.
//
//   2. CONTAINER — otherwise, start a fresh postgres:16 container and
//      apply backend/db-init.sql to install schema, stored procedures,
//      triggers, and seed data. Default for CI and any host with Docker.
//
// Shared across all test collections via [Collection("Database")].
public sealed class DbFixture : IAsyncLifetime
{
    private const string ExternalEnvVar = "TEST_DATABASE_URL";
    private readonly string? _externalConnectionString =
        Environment.GetEnvironmentVariable(ExternalEnvVar);

    private PostgreSqlContainer? _container;

    public string ConnectionString =>
        _externalConnectionString
        ?? _container?.GetConnectionString()
        ?? throw new InvalidOperationException("DbFixture has not been initialized.");

    public async Task InitializeAsync()
    {
        if (_externalConnectionString is not null)
        {
            // External PG: trust the caller's schema, just verify connectivity.
            await using var probe = new NpgsqlConnection(_externalConnectionString);
            await probe.OpenAsync();
            return;
        }

        _container = new PostgreSqlBuilder("postgres:16")
            .WithDatabase("sportstock_test")
            .WithUsername("test")
            .WithPassword("test")
            .Build();
        await _container.StartAsync();

        // db-init.sql is copied into the test output directory by the csproj
        // <Content Include="...\db-init.sql"> rule; see SportStock.Api.Tests.csproj.
        var sqlPath = Path.Combine(AppContext.BaseDirectory, "db-init.sql");
        if (!File.Exists(sqlPath))
            throw new FileNotFoundException(
                $"db-init.sql not found at {sqlPath}. Verify the Content/CopyToOutputDirectory wiring in SportStock.Api.Tests.csproj.");

        var sql = await File.ReadAllTextAsync(sqlPath);

        await using var conn = new NpgsqlConnection(_container.GetConnectionString());
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }
}

[CollectionDefinition("Database")]
public sealed class DatabaseCollection : ICollectionFixture<DbFixture>
{
    // Empty — marker only.
}
