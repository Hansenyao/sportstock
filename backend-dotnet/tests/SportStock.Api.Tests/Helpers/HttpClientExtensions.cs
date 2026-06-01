using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace SportStock.Api.Tests.Helpers;

// Convenience wrappers so tests read like:
//   var dto = await client.GetAsAsync<UserDto>("/api/v1/users/me");
internal static class HttpClientExtensions
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public static void SetBearer(this HttpClient client, string token) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

    public static async Task<T?> GetAsAsync<T>(this HttpClient client, string path, CancellationToken ct = default)
    {
        var response = await client.GetAsync(path, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(JsonOpts, ct);
    }

    public static async Task<HttpResponseMessage> PostJsonAsync<TBody>(
        this HttpClient client, string path, TBody body, CancellationToken ct = default)
    {
        return await client.PostAsJsonAsync(path, body, JsonOpts, ct);
    }

    public static async Task<T?> PostJsonAsAsync<TBody, T>(
        this HttpClient client, string path, TBody body, CancellationToken ct = default)
    {
        var response = await client.PostJsonAsync(path, body, ct);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(JsonOpts, ct);
    }
}
