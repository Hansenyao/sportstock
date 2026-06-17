namespace SportStock.Api.Audit;

public interface IAuditableEntity
{
    /// <summary>Action prefix, e.g. "asset_item", "loan".</summary>
    string AuditEntityType { get; }
    Guid?  AuditEntityId  { get; }
    Guid?  AuditClubId    { get; }

    /// <summary>
    /// Snapshot of human-readable context fields. Called immediately before delete or during update
    /// while nav properties are still in memory.
    /// </summary>
    Dictionary<string, object?> GetAuditMeta();
}
