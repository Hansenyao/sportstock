namespace SportStock.Api.Audit;

/// <summary>
/// Scoped per-request store. Services call Override() before SaveChangesAsync()
/// to attach a semantic action name; the interceptor reads and clears it.
/// </summary>
public sealed class AuditContext
{
    public string? ActionOverride     { get; private set; }
    public string? EntityTypeOverride { get; private set; }
    public Guid?   EntityIdOverride   { get; private set; }
    public Guid?   ClubIdOverride     { get; private set; }
    public object? MetaOverride       { get; private set; }
    public bool    HasOverride        => ActionOverride is not null;

    public void Override(
        string  action,
        string? entityType = null,
        Guid?   entityId   = null,
        Guid?   clubId     = null,
        object? meta       = null)
    {
        ActionOverride     = action;
        EntityTypeOverride = entityType;
        EntityIdOverride   = entityId;
        ClubIdOverride     = clubId;
        MetaOverride       = meta;
    }

    public void Clear()
    {
        ActionOverride     = null;
        EntityTypeOverride = null;
        EntityIdOverride   = null;
        ClubIdOverride     = null;
        MetaOverride       = null;
    }
}
