namespace SportStock.Api.Integrations;

public interface IStorageService
{
    // Returns the public URL of the uploaded file.
    Task<string> UploadAsync(string objectPath, Stream content, string contentType, CancellationToken ct = default);

    Task DeleteAsync(string objectPath, CancellationToken ct = default);

    string GetPublicUrl(string objectPath);
}
