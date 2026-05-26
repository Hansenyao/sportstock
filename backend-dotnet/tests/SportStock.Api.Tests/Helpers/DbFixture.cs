using Npgsql;
using Testcontainers.PostgreSql;

namespace SportStock.Api.Tests.Helpers;

// Boots one PostgreSQL container per `dotnet test` run and applies
// backend/db-init.sql to install schema, stored procedures, triggers, and
// seed data — the same SQL that runs against the real Azure database.
// Shared across all test collections via [Collection("Database")].
public sealed class DbFixture : IAsyncLifetime
{
    public PostgreSqlContainer Container { get; } = new PostgreSqlBuilder("postgres:16")
        .WithDatabase("sportstock_test")
        .WithUsername("test")
        .WithPassword("test")
        .Build();

    public string ConnectionString => Container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await Container.StartAsync();

        // db-init.sql is copied into the test output directory by the csproj
        // <Content Include="...\db-init.sql"> rule; see SportStock.Api.Tests.csproj.
        var sqlPath = Path.Combine(AppContext.BaseDirectory, "db-init.sql");
        if (!File.Exists(sqlPath))
            throw new FileNotFoundException(
                $"db-init.sql not found at {sqlPath}. Verify the Content/CopyToOutputDirectory wiring in SportStock.Api.Tests.csproj.");

        var sql = await File.ReadAllTextAsync(sqlPath);

        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        await Container.DisposeAsync();
    }
}

[CollectionDefinition("Database")]
public sealed class DatabaseCollection : ICollectionFixture<DbFixture>
{
    // Empty — marker only.
}
