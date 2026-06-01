using Microsoft.AspNetCore.Mvc;

namespace SportStock.Api.Dtos.WriteOffs;

public sealed class ListWriteOffsQuery
{
    [FromQuery(Name = "asset_type_id")] public Guid? AssetTypeId { get; set; }
    [FromQuery(Name = "source")] public string? Source { get; set; }
    [FromQuery(Name = "from_date")] public DateTime? FromDate { get; set; }
    [FromQuery(Name = "to_date")] public DateTime? ToDate { get; set; }
    [FromQuery(Name = "page")] public int Page { get; set; } = 1;
    [FromQuery(Name = "limit")] public int Limit { get; set; } = 20;
}
