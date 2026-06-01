using Microsoft.Extensions.Options;
using SportStock.Api.Configuration;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Integrations;

internal sealed class SupabaseStorageClient(
    IHttpClientFactory httpFactory,
    IOptions<SupabaseOptions> options) : ISupabaseStorage
{
    public const string HttpClientName = "supabase";

    private readonly SupabaseOptions _opts = options.Value;

    public async Task<string> UploadAsync(
        string objectPath,
        Stream content,
        string contentType,
        CancellationToken ct = default)
    {
        var client = httpFactory.CreateClient(HttpClientName);
        using var streamContent = new StreamContent(content);
        streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        // upsert mirrors current Node behavior (storage.ts uses `upsert: true`)
        streamContent.Headers.Add("x-upsert", "true");

        var response = await client.PostAsync(
            $"object/{_opts.Bucket}/{objectPath}", streamContent, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new AppException($"Supabase upload failed: {body}", (int)response.StatusCode);
        }

        return GetPublicUrl(objectPath);
    }

    public async Task DeleteAsync(string objectPath, CancellationToken ct = default)
    {
        var client = httpFactory.CreateClient(HttpClientName);
        var response = await client.DeleteAsync($"object/{_opts.Bucket}/{objectPath}", ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new AppException($"Supabase delete failed: {body}", (int)response.StatusCode);
        }
    }

    public string GetPublicUrl(string objectPath) =>
        $"{_opts.Url.TrimEnd('/')}/storage/v1/object/public/{_opts.Bucket}/{objectPath}";
}
