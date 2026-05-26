using Microsoft.AspNetCore.Mvc;

namespace SportStock.Api.Dtos.Inventory;

public sealed class ListMovementsQuery
{
    [FromQuery(Name = "asset_type_id")] public Guid? AssetTypeId { get; set; }
    [FromQuery(Name = "type")] public string? Type { get; set; }
    [FromQuery(Name = "from_date")] public DateTime? FromDate { get; set; }
    [FromQuery(Name = "to_date")] public DateTime? ToDate { get; set; }
    [FromQuery(Name = "page")] public int Page { get; set; } = 1;
    [FromQuery(Name = "limit")] public int Limit { get; set; } = 20;
}
