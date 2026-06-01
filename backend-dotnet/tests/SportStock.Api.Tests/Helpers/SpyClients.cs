using System.Collections.Concurrent;
using SportStock.Api.Integrations;

namespace SportStock.Api.Tests.Helpers;

// Captures FCM sends instead of dispatching them. Tests assert by reading
// .Sends after the act phase.
public sealed class SpyFcmClient : IFcmClient
{
    public sealed record SendRecord(
        IReadOnlyList<string> Tokens,
        string Title,
        string Body,
        IReadOnlyDictionary<string, string>? Data);

    private readonly ConcurrentQueue<SendRecord> _sends = new();
    public IReadOnlyList<SendRecord> Sends => _sends.ToList();

    public Task<IReadOnlyList<string>> SendToTokensAsync(
        IReadOnlyList<string> tokens,
        string title,
        string body,
        IReadOnlyDictionary<string, string>? data = null,
        CancellationToken ct = default)
    {
        _sends.Enqueue(new SendRecord(tokens, title, body, data));
        // No invalid tokens — caller-visible behavior matches a fully-healthy fleet.
        return Task.FromResult<IReadOnlyList<string>>(Array.Empty<string>());
    }
}

// Captures OTP code emissions so verify-email / reset-password flow tests can
// pull the code without parsing a real email body.
public sealed class SpyEmailSender : IEmailSender
{
    public sealed record SendRecord(string Email, string Code, VerificationCodeKind Kind);

    private readonly ConcurrentQueue<SendRecord> _sends = new();
    public IReadOnlyList<SendRecord> Sends => _sends.ToList();

    public string? LastCodeFor(string email) =>
        _sends.LastOrDefault(s => s.Email.Equals(email, StringComparison.OrdinalIgnoreCase))?.Code;

    public Task SendVerificationCodeAsync(
        string email,
        string code,
        VerificationCodeKind kind,
        CancellationToken ct = default)
    {
        _sends.Enqueue(new SendRecord(email, code, kind));
        return Task.CompletedTask;
    }
}

// Stores uploaded bodies in memory and pretends to issue a stable URL so
// callers can pass it through DB inserts and read it back unchanged.
public sealed class InMemorySupabaseStorage : ISupabaseStorage
{
    private readonly ConcurrentDictionary<string, byte[]> _store = new();
    public IReadOnlyDictionary<string, byte[]> Store => _store;

    public async Task<string> UploadAsync(
        string objectPath, Stream content, string contentType, CancellationToken ct = default)
    {
        await using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);
        _store[objectPath] = ms.ToArray();
        return GetPublicUrl(objectPath);
    }

    public Task DeleteAsync(string objectPath, CancellationToken ct = default)
    {
        _store.TryRemove(objectPath, out _);
        return Task.CompletedTask;
    }

    public string GetPublicUrl(string objectPath) =>
        $"https://stub.test.invalid/storage/v1/object/public/test/{objectPath}";
}
