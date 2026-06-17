#nullable enable
using System;
using System.Text.Json;

namespace SportStock.Api.Data.Entities;

public partial class AuditLog
{
    public Guid Id { get; set; }
    public Guid? ClubId { get; set; }
    public Guid? UserId { get; set; }
    public string Action { get; set; } = null!;
    public string? EntityType { get; set; }
    public Guid? EntityId { get; set; }
    public JsonDocument? Meta { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}
