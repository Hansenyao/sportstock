using SportStock.Api.Data.Enums;

namespace SportStock.Api.Dtos.Loans;

// Mirrors Node's LOAN_SELECT projection — loan columns + denormalized
// names (coach/created_by/approved_by/checkout_by/return_confirmed_by/team)
// plus the items[] array.
public sealed class LoanResponse
{
    public Guid Id { get; set; }
    public Guid ClubId { get; set; }
    public Guid CoachId { get; set; }
    public Guid? TeamId { get; set; }
    public Guid? CreatedBy { get; set; }
    public Guid? ApprovedBy { get; set; }
    public Guid? CheckoutBy { get; set; }
    public Guid? ReturnConfirmedBy { get; set; }
    public Guid? WarehouseId { get; set; }
    public string? WarehouseName { get; set; }
    public string? Reason { get; set; }
    public LoanStatus Status { get; set; }
    public DateOnly DueDate { get; set; }
    public string? RejectionReason { get; set; }
    public DateTime? CheckedOutAt { get; set; }
    public DateTime? ReturnedAt { get; set; }
    public string? ReturnNotes { get; set; }
    public DateTime? DueReminderSentAt { get; set; }
    public DateTime? OverdueNotifiedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public string CoachName { get; set; } = string.Empty;
    public string CoachEmail { get; set; } = string.Empty;
    public string? CreatedByName { get; set; }
    public string? ApprovedByName { get; set; }
    public string? CheckoutByName { get; set; }
    public string? ReturnConfirmedByName { get; set; }
    public string? TeamName { get; set; }

    public IReadOnlyList<LoanItemInfo> Items { get; set; } = Array.Empty<LoanItemInfo>();
}
