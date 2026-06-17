using Microsoft.AspNetCore.Mvc;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;

namespace SportStock.Api.Dtos.Admin;

// Phase 12 ships a lot of small response shapes; bundling them in one file
// avoids 25+ tiny DTO files for what is essentially a read-mostly surface.

public sealed class PlatformStatsResponse
{
    public long TotalClubs { get; set; }
    public long ActiveClubs { get; set; }
    public long TotalUsers { get; set; }
    public long TotalAssets { get; set; }
    public long ActiveLoans { get; set; }
    public long OverdueLoans { get; set; }
}

public sealed class AssetByStatusItem
{
    public string Status { get; set; } = string.Empty;
    public long Total { get; set; }
}

public sealed class AnalyticsOverviewPlatform
{
    public long TotalClubs { get; set; }
    public long ActiveClubs { get; set; }
    public long TotalUsers { get; set; }
    public long TotalAssets { get; set; }
    public long ActiveLoans { get; set; }
    public long OverdueLoans { get; set; }
    public IReadOnlyList<AssetByStatusItem> AssetByStatus { get; set; } = Array.Empty<AssetByStatusItem>();
    public decimal TotalAssetValue { get; set; }
}

public sealed class AnalyticsOverviewClub
{
    public long UserCount { get; set; }
    public long AssetCount { get; set; }
    public long ActiveLoans { get; set; }
    public long OverdueLoans { get; set; }
    public IReadOnlyList<AssetByStatusItem> AssetByStatus { get; set; } = Array.Empty<AssetByStatusItem>();
    public decimal TotalAssetValue { get; set; }
}

public sealed class AnalyticsLoanTrend
{
    public string Month { get; set; } = string.Empty;
    public long LoanCount { get; set; }
}

public sealed class AnalyticsTopAssetItem
{
    public string AssetName { get; set; } = string.Empty;
    public long LoanCount { get; set; }
}

public sealed class AnalyticsLoansResponse
{
    public IReadOnlyList<AnalyticsLoanTrend> MonthlyTrend { get; set; } = Array.Empty<AnalyticsLoanTrend>();
    public IReadOnlyList<AnalyticsTopAssetItem> TopAssets { get; set; } = Array.Empty<AnalyticsTopAssetItem>();
}

public sealed class AnalyticsAssetsStatusItem
{
    public string Status { get; set; } = string.Empty;
    public long BatchCount { get; set; }
    public long TotalQty { get; set; }
    public decimal TotalValue { get; set; }
}

public sealed class AnalyticsAssetsCategoryItem
{
    public string Category { get; set; } = string.Empty;
    public long TypeCount { get; set; }
    public long TotalQty { get; set; }
    public decimal TotalValue { get; set; }
}

public sealed class AnalyticsAssetsResponse
{
    public IReadOnlyList<AnalyticsAssetsStatusItem> ByStatus { get; set; } = Array.Empty<AnalyticsAssetsStatusItem>();
    public IReadOnlyList<AnalyticsAssetsCategoryItem> ByCategory { get; set; } = Array.Empty<AnalyticsAssetsCategoryItem>();
}

public sealed class AnalyticsGrowthClubItem
{
    public string Month { get; set; } = string.Empty;
    public long NewClubs { get; set; }
}

public sealed class AnalyticsGrowthUserItem
{
    public string Month { get; set; } = string.Empty;
    public long NewUsers { get; set; }
}

public sealed class AnalyticsGrowthResponse
{
    public IReadOnlyList<AnalyticsGrowthClubItem> Clubs { get; set; } = Array.Empty<AnalyticsGrowthClubItem>();
    public IReadOnlyList<AnalyticsGrowthUserItem> Users { get; set; } = Array.Empty<AnalyticsGrowthUserItem>();
}

public sealed class ClubListItemResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? SportType { get; set; }
    public string? ContactEmail { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public long UserCount { get; set; }
    public long AssetCount { get; set; }
    public long ActiveLoanCount { get; set; }
}

public sealed class ClubAdminAccount
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool EmailVerified { get; set; }
}

public sealed class ClubStats
{
    public long UserCount { get; set; }
    public long AssetCount { get; set; }
    public long ActiveLoanCount { get; set; }
    public long OverdueLoanCount { get; set; }
}

public sealed class ClubDetailResponse
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? SportType { get; set; }
    public string? ContactEmail { get; set; }
    public string? Address { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public ClubAdminAccount? AdminAccount { get; set; }
    public ClubStats Stats { get; set; } = new();
}

public sealed class UpdateActiveRequest
{
    public bool? IsActive { get; set; }
}

public sealed class TempPasswordResponse
{
    public string TempPassword { get; set; } = string.Empty;
}

public sealed class AdminUserItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public ClubRole Role { get; set; }
    public bool IsActive { get; set; }
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class AdminAssetItem
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Size { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public long TotalQuantity { get; set; }
    public long AvailableQuantity { get; set; }
    public long BatchCount { get; set; }
    public string Status { get; set; } = string.Empty;
}

public sealed class AdminLoanItem
{
    public Guid Id { get; set; }
    public LoanStatus Status { get; set; }
    public DateOnly DueDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CoachName { get; set; } = string.Empty;
    public long ItemCount { get; set; }
}

public sealed class ListClubsQuery
{
    [FromQuery(Name = "page")] public int Page { get; set; } = 1;
    [FromQuery(Name = "limit")] public int Limit { get; set; } = 20;
    [FromQuery(Name = "search")] public string? Search { get; set; }
}

public sealed class AnalyticsClubFilterQuery
{
    [FromQuery(Name = "club_id")] public Guid? ClubId { get; set; }
}

public sealed class ListClubResourcesQuery
{
    [FromQuery(Name = "page")] public int Page { get; set; } = 1;
    [FromQuery(Name = "limit")] public int Limit { get; set; } = 20;
    [FromQuery(Name = "search")] public string? Search { get; set; }
    [FromQuery(Name = "status")] public string? Status { get; set; }
}

public sealed class StatusMessageResponse
{
    public string Message { get; set; } = string.Empty;
}
