using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.Extensions.Options;
using SportStock.Api.Configuration;

namespace SportStock.Api.Integrations;

public sealed class CloudinaryStorageClient : IStorageService
{
    private readonly Cloudinary _cloudinary;

    public CloudinaryStorageClient(IOptions<CloudinaryOptions> options)
    {
        var o = options.Value;
        _cloudinary = new Cloudinary(new Account(o.CloudName, o.ApiKey, o.ApiSecret));
        _cloudinary.Api.Secure = true;
    }

    public async Task<string> UploadAsync(
        string objectPath, Stream content, string contentType, CancellationToken ct = default)
    {
        var publicId = PathToPublicId(objectPath);
        var folder   = Path.GetDirectoryName(publicId)?.Replace('\\', '/') ?? string.Empty;
        var fileName = Path.GetFileName(publicId);

        var uploadParams = new ImageUploadParams
        {
            File      = new FileDescription(fileName, content),
            PublicId  = fileName,
            Folder    = folder,
            Overwrite = true,
        };

        var result = await _cloudinary.UploadAsync(uploadParams, ct);

        if (result.Error is not null)
            throw new InvalidOperationException($"Cloudinary upload failed: {result.Error.Message}");

        return result.SecureUrl.ToString();
    }

    public async Task DeleteAsync(string objectPath, CancellationToken ct = default)
    {
        var publicId    = PathToPublicId(objectPath);
        var deleteParams = new DeletionParams(publicId) { ResourceType = ResourceType.Image };
        var result      = await _cloudinary.DestroyAsync(deleteParams);

        if (result.Result is not ("ok" or "not found"))
            throw new InvalidOperationException($"Cloudinary delete failed: {result.Result}");
    }

    public string GetPublicUrl(string objectPath)
    {
        var publicId = PathToPublicId(objectPath);
        var ext = Path.GetExtension(objectPath).TrimStart('.');
        var withFormat = string.IsNullOrEmpty(ext) ? publicId : $"{publicId}.{ext}";
        return _cloudinary.Api.UrlImgUp.BuildUrl(withFormat);
    }

    // Strips the extension so Cloudinary uses it as public_id.
    // e.g. "assets/abc/img_123.jpg" → "assets/abc/img_123"
    private static string PathToPublicId(string objectPath)
    {
        var ext = Path.GetExtension(objectPath);
        return string.IsNullOrEmpty(ext)
            ? objectPath
            : objectPath[..^ext.Length];
    }
}
