using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Common;
using SportStock.Api.Dtos.Loans;

namespace SportStock.Api.Services;

public interface ILoanService
{
    Task<PaginatedResult<LoanResponse>> ListAsync(
        Guid clubId, Guid userId, ClubRole? role, ListLoansQuery query, CancellationToken ct = default);

    Task<LoanResponse> GetAsync(
        Guid loanId, Guid clubId, Guid userId, ClubRole? role, CancellationToken ct = default);

    Task<LoanResponse> CreateAsync(
        Guid clubId, Guid requesterId, ClubRole? requesterRole, CreateLoanRequest req, CancellationToken ct = default);

    Task<LoanResponse> UpdateAsync(
        Guid loanId, Guid clubId, Guid userId, ClubRole? role, UpdateLoanRequest req, CancellationToken ct = default);

    Task DeleteAsync(
        Guid loanId, Guid clubId, Guid userId, ClubRole? role, CancellationToken ct = default);

    Task<LoanResponse> ApproveAsync(
        Guid loanId, Guid approverId, Guid clubId, CancellationToken ct = default);

    Task<LoanResponse> RejectAsync(
        Guid loanId, Guid approverId, Guid clubId, string? reason, CancellationToken ct = default);

    Task<LoanResponse> CheckoutAsync(
        Guid loanId, Guid operatorId, Guid clubId, CancellationToken ct = default);

    Task<LoanResponse> ConfirmReturnAsync(
        Guid loanId, Guid operatorId, Guid clubId, ReturnLoanRequest req, CancellationToken ct = default);
}
