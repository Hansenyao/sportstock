namespace SportStock.Api.Integrations;

// Wraps FirebaseAdmin's Messaging API. Returns the list of tokens FCM rejected
// as invalid so the caller can prune them from fcm_tokens. The fcm_tokens
// table lookup itself is NOT this client's responsibility — see
// NotificationService for the DB-driven send orchestration.
public interface IFcmClient
{
    // Sends one notification to a fan-out of tokens.
    // Returns the subset of tokens FCM reported as permanently invalid
    // (codes messaging/invalid-registration-token or
    // messaging/registration-token-not-registered).
    Task<IReadOnlyList<string>> SendToTokensAsync(
        IReadOnlyList<string> tokens,
        string title,
        string body,
        IReadOnlyDictionary<string, string>? data = null,
        CancellationToken ct = default);
}
