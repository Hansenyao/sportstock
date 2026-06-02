using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Dtos.Clubs;
using SportStock.Api.Exceptions;
using SportStock.Api.Integrations;

namespace SportStock.Api.Services;

// Ports backend/src/services/club.service.ts. PUT /clubs/me follows Node's
// COALESCE-style partial update: nulls in the request are treated as
// "preserve existing" rather than "clear field". The retirement_alert_mode
// and retirement_alert_value invariants throw AppException(..., 422) here
// (not in the validator) so the wire-level status code matches Node.
internal sealed class ClubService(
    SportStockDbContext db,
    ISupabaseStorage storage) : IClubService
{
    private static readonly HashSet<string> AllowedAlertModes = new(StringComparer.Ordinal)
    {
        "months",
        "percent",
    };

    public async Task<ClubResponse> GetAsync(Guid clubId, CancellationToken ct = default)
    {
        var club = await db.Clubs
            .IgnoreQueryFilters()
            .Include(c => c.SportType)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club is null) throw new AppException("Club not found", 404);
        return Map(club);
    }

    public async Task<ClubResponse> UpdateAsync(
        Guid clubId, UpdateClubRequest req, CancellationToken ct = default)
    {
        if (req.RetirementAlertMode is not null
            && !AllowedAlertModes.Contains(req.RetirementAlertMode))
            throw new AppException("retirement_alert_mode must be \"months\" or \"percent\"", 422);

        // Mirrors Node `parseInt(String(value), 10)` + isNaN/positive check;
        // returns null for "absent or explicit JSON null" so partial-update
        // semantics still work.
        var alertValue = ParseAlertValue(req.RetirementAlertValue);

        var club = await db.Clubs
            .IgnoreQueryFilters()
            .Include(c => c.SportType)
            .FirstOrDefaultAsync(c => c.Id == clubId, ct);
        if (club is null) throw new AppException("Club not found", 404);

        if (req.Name is not null) club.Name = req.Name;
        if (req.SportType is not null)
        {
            // req.SportType is the sport type name; resolve to ID or null
            if (req.SportType.Length == 0)
            {
                club.SportTypeId = null;
            }
            else
            {
                var sportType = await db.SportTypes
                    .FirstOrDefaultAsync(st => st.Name == req.SportType, ct);
                club.SportTypeId = sportType?.Id;
            }
        }
        if (req.Address is not null) club.Address = req.Address;
        if (req.ContactEmail is not null) club.ContactEmail = req.ContactEmail;
        if (req.LowStockThreshold is not null) club.LowStockThreshold = req.LowStockThreshold.Value;
        if (req.RetirementAlertMode is not null) club.RetirementAlertMode = req.RetirementAlertMode;
        if (alertValue is not null) club.RetirementAlertValue = alertValue.Value;

        await db.SaveChangesAsync(ct);
        return Map(club);
    }

    private static int? ParseAlertValue(object? raw)
    {
        if (raw is null) return null;
        if (raw is not JsonElement el)
            throw new AppException("retirement_alert_value must be a positive integer", 422);
        if (el.ValueKind == JsonValueKind.Null) return null;

        int parsed = 0;
        var parsedOk =
            (el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out parsed))
            || (el.ValueKind == JsonValueKind.String && int.TryParse(el.GetString(), out parsed));

        if (!parsedOk || parsed <= 0)
            throw new AppException("retirement_alert_value must be a positive integer", 422);

        return parsed;
    }

    public async Task<UploadLogoResponse> UpdateLogoAsync(
        Guid clubId,
        Stream content,
        string contentType,
        string originalFileName,
        CancellationToken ct = default)
    {
        var ext = Path.GetExtension(originalFileName).TrimStart('.');
        if (string.IsNullOrWhiteSpace(ext)) ext = "bin";
        var path = $"clubs/{clubId}/logo_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{ext}";

        var url = await storage.UploadAsync(path, content, contentType, ct);

        await db.Clubs
            .IgnoreQueryFilters()
            .Where(c => c.Id == clubId)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.LogoUrl, url), ct);

        return new UploadLogoResponse { LogoUrl = url };
    }

    private static ClubResponse Map(SportStock.Api.Data.Entities.Club c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        SportType = c.SportType?.Name,
        Address = c.Address,
        ContactEmail = c.ContactEmail,
        IsActive = c.IsActive,
        LogoUrl = c.LogoUrl,
        LowStockThreshold = c.LowStockThreshold,
        RetirementAlertMode = c.RetirementAlertMode,
        RetirementAlertValue = c.RetirementAlertValue,
        CreatedAt = c.CreatedAt,
        UpdatedAt = c.UpdatedAt,
    };
}
