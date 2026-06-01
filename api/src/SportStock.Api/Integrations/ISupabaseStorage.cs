namespace SportStock.Api.Integrations;

// Wraps Supabase Storage REST. Implementation uses a named HttpClient
// registered against {SUPABASE_URL}/storage/v1 with the service-role bearer.
// Avoids the community supabase-csharp SDK (low maintenance).
public interface ISupabaseStorage
{
    // Returns the public URL of the uploaded object.
    Task<string> UploadAsync(string objectPath, Stream content, string contentType, CancellationToken ct = default);

    Task DeleteAsync(string objectPath, CancellationToken ct = default);

    string GetPublicUrl(string objectPath);
}
