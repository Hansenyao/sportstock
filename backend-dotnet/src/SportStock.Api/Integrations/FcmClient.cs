using FirebaseAdmin.Messaging;

namespace SportStock.Api.Integrations;

// FirebaseApp.Create is called once at startup in Program.cs using the
// FirebaseOptions credentials (with the same \n -> newline normalization as
// the Node config). This client is then a singleton wrapper around
// FirebaseMessaging.DefaultInstance.
internal sealed class FcmClient(ILogger<FcmClient> log) : IFcmClient
{
    public async Task<IReadOnlyList<string>> SendToTokensAsync(
        IReadOnlyList<string> tokens,
        string title,
        string body,
        IReadOnlyDictionary<string, string>? data = null,
        CancellationToken ct = default)
    {
        if (tokens.Count == 0) return Array.Empty<string>();

        var message = new MulticastMessage
        {
            Tokens = tokens.ToList(),
            Notification = new Notification { Title = title, Body = body },
            Data = data?.ToDictionary(kv => kv.Key, kv => kv.Value) ?? new Dictionary<string, string>(),
        };

        var response = await FirebaseMessaging.DefaultInstance.SendEachForMulticastAsync(message, ct);

        var invalid = new List<string>();
        for (var i = 0; i < response.Responses.Count; i++)
        {
            var resp = response.Responses[i];
            if (resp.IsSuccess) continue;

            var code = resp.Exception?.MessagingErrorCode;
            if (code is MessagingErrorCode.InvalidArgument or MessagingErrorCode.Unregistered)
            {
                invalid.Add(tokens[i]);
            }
            else
            {
                log.LogWarning(resp.Exception, "FCM send failed for token {TokenSuffix}",
                    Tail(tokens[i]));
            }
        }
        return invalid;
    }

    private static string Tail(string token) =>
        token.Length <= 8 ? token : "..." + token[^8..];
}
