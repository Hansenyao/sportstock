using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SportStock.Api.Data;
using SportStock.Api.Integrations;

namespace SportStock.Api.Tests.Helpers;

// Hosts the real Program.cs pipeline against an in-memory test server.
//
// Two construction modes:
//   - Default (parameterless): no DB container. Suitable for endpoints that
//     never touch the database (e.g. /health). DB connection string falls
//     back to the placeholder in appsettings.Test.json — opening a query
//     would fail, but boot succeeds.
//   - WithDb(fixture): swaps Db__ConnectionString to the Testcontainers PG
//     instance so DbContext queries hit the real schema. Use this for any
//     test that exercises business endpoints.
//
// External integrations (IFcmClient, IEmailSender, IStorageService) are
// replaced with spy implementations regardless of mode so no test ever
// reaches real network.
public sealed class SportStockWebApplicationFactory : WebApplicationFactory<Program>
{
    private string? _dbConnectionStringOverride;

    public SportStockWebApplicationFactory WithDb(DbFixture fixture)
    {
        _dbConnectionStringOverride = fixture.ConnectionString;
        return this;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Test");

        builder.ConfigureAppConfiguration((ctx, cfg) =>
        {
            // appsettings.Test.json is copied next to the test assembly via
            // <Content> in SportStock.Api.Tests.csproj. WebApplicationFactory
            // sets ContentRootPath to the API project, so we resolve the path
            // off AppContext.BaseDirectory (= the test bin/) instead.
            var testSettings = Path.Combine(AppContext.BaseDirectory, "appsettings.Test.json");
            cfg.AddJsonFile(testSettings, optional: false);
            if (_dbConnectionStringOverride is not null)
            {
                cfg.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Db:ConnectionString"] = _dbConnectionStringOverride,
                });
            }
        });

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IFcmClient>();
            services.AddSingleton<IFcmClient, SpyFcmClient>();

            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender, SpyEmailSender>();

            services.RemoveAll<IStorageService>();
            services.AddSingleton<IStorageService, InMemoryStorageService>();
        });
    }

    // Convenience helper: open a scope and hand the test a fresh DbContext.
    // Use this for seeding fixture data and for read-back assertions.
    public async Task<T> WithDbContextAsync<T>(Func<SportStockDbContext, Task<T>> work)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SportStockDbContext>();
        return await work(db);
    }

    public async Task WithDbContextAsync(Func<SportStockDbContext, Task> work)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<SportStockDbContext>();
        await work(db);
    }

    // Generic spy resolver for tests that need to assert on captured calls.
    public T GetSpy<T>() where T : class
    {
        using var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<T>();
    }
}
