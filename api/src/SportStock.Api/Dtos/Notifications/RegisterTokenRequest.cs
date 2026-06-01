using System.Text.Json;

namespace SportStock.Api.Dtos.Notifications;

public sealed class RegisterTokenRequest
{
    public string? Token { get; set; }
    public JsonElement? DeviceInfo { get; set; }
}
