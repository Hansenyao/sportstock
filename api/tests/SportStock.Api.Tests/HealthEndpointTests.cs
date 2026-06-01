using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using SportStock.Api.Tests.Helpers;

namespace SportStock.Api.Tests;

// Phase 0 smoke test. Does not require Docker — runs entirely in-process
// against a WebApplicationFactory<Program> with stubbed integrations.
//
// Acceptance for Phase 0: this test is green via `dotnet test`.
public sealed class HealthEndpointTests : IClassFixture<SportStockWebApplicationFactory>
{
    private readonly SportStockWebApplicationFactory _factory;

    public HealthEndpointTests(SportStockWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Health_Should_Return_200_With_Status_Ok()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        body.Should().NotBeNull();
        body!.Status.Should().Be("ok");
        body.Timestamp.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Unknown_Route_Should_Return_404_With_Json_Shape()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/this/route/does/not/exist");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);

        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        body.Should().NotBeNull();
        body!.StatusCode.Should().Be(404);
        body.Error.Should().Be("Not Found");
        body.Message.Should().Be("Route not found");
    }

    private sealed record HealthResponse(string Status, string Timestamp);
    private sealed record ErrorResponse(int StatusCode, string Error, string Message);
}
