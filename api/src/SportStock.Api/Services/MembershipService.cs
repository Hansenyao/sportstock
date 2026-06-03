using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;
using SportStock.Api.Dtos.Membership;
using SportStock.Api.Exceptions;

namespace SportStock.Api.Services;

public sealed class MembershipService(SportStockDbContext db, IAuditLogService audit) : IMembershipService
{
    public async Task<InvitationDto> InviteUserAsync(Guid clubId, Guid inviterId, InviteUserRequest req)
    {
        var invitee = await db.Users.FirstOrDefaultAsync(u => u.Id == req.InviteeId && u.IsActive)
            ?? throw new AppException("User not found", 404);

        if (await db.ClubMemberships.AnyAsync(m => m.ClubId == clubId && m.UserId == req.InviteeId && m.IsActive))
            throw new AppException("User is already a member of this club", 409);

        // Cancel any existing pending invitation
        var existing = await db.ClubInvitations.FirstOrDefaultAsync(
            i => i.ClubId == clubId && i.InviteeId == req.InviteeId && i.Status == "pending");
        if (existing is not null) existing.Status = "cancelled";

        var invitation = new ClubInvitation
        {
            Id          = Guid.NewGuid(),
            ClubId      = clubId,
            InviteeId   = req.InviteeId,
            InvitedById = inviterId,
            Role        = req.Role,
            Status      = "pending",
            CreatedAt   = DateTime.UtcNow,
        };
        db.ClubInvitations.Add(invitation);
        await db.SaveChangesAsync();

        // TODO: send email notification to invitee (reserved — not implemented in current stage)
        // await emailService.SendInvitationEmailAsync(invitee.Email, ...);

        await audit.LogAsync("membership.invite", clubId, inviterId, "user", req.InviteeId, new { role = req.Role.ToString() });
        return MapToDto(invitation);
    }

    public async Task<MembershipDto> AcceptInvitationAsync(Guid clubId, Guid invitationId, Guid userId)
    {
        var invitation = await db.ClubInvitations
            .FirstOrDefaultAsync(i => i.Id == invitationId && i.ClubId == clubId && i.InviteeId == userId)
            ?? throw new AppException("Invitation not found", 404);

        if (invitation.Status != "pending")
            throw new AppException("Invitation is no longer pending", 409);

        invitation.Status      = "accepted";
        invitation.RespondedAt = DateTime.UtcNow;

        var membership = new ClubMembership
        {
            Id        = Guid.NewGuid(),
            ClubId    = clubId,
            UserId    = userId,
            Role      = invitation.Role,
            IsActive  = true,
            InvitedBy = invitation.InvitedById,
            JoinedAt  = DateTime.UtcNow,
        };
        db.ClubMemberships.Add(membership);
        await db.SaveChangesAsync();

        await audit.LogAsync("membership.accept", clubId, userId, "club_membership", membership.Id);
        return new MembershipDto(membership.Id, membership.ClubId, membership.UserId, membership.Role, membership.JoinedAt);
    }

    public async Task DeclineInvitationAsync(Guid clubId, Guid invitationId, Guid userId)
    {
        var invitation = await db.ClubInvitations
            .FirstOrDefaultAsync(i => i.Id == invitationId && i.ClubId == clubId && i.InviteeId == userId)
            ?? throw new AppException("Invitation not found", 404);

        if (invitation.Status != "pending")
            throw new AppException("Invitation is no longer pending", 409);

        invitation.Status      = "declined";
        invitation.RespondedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task CancelInvitationAsync(Guid clubId, Guid invitationId, Guid adminId)
    {
        var invitation = await db.ClubInvitations
            .FirstOrDefaultAsync(i => i.Id == invitationId && i.ClubId == clubId)
            ?? throw new AppException("Invitation not found", 404);

        if (invitation.Status != "pending")
            throw new AppException("Invitation is no longer pending", 409);

        invitation.Status      = "cancelled";
        invitation.RespondedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    public async Task<List<MemberDto>> ListMembersAsync(Guid clubId)
        => await db.ClubMemberships
            .Include(m => m.User)
            .Where(m => m.ClubId == clubId && m.IsActive)
            .OrderBy(m => m.User.LastName).ThenBy(m => m.User.FirstName)
            .Select(m => new MemberDto(m.UserId, m.User.FirstName, m.User.LastName, m.User.Email, m.Role, m.JoinedAt, m.IsActive))
            .ToListAsync();

    public async Task<List<UserSearchResult>> SearchUsersAsync(Guid clubId, string query)
    {
        var term = query.ToLowerInvariant();
        var existingUserIds = await db.ClubMemberships
            .Where(m => m.ClubId == clubId && m.IsActive)
            .Select(m => m.UserId)
            .ToListAsync();

        return await db.Users
            .Where(u => u.IsActive
                && !existingUserIds.Contains(u.Id)
                && (u.Email.Contains(term) || (u.FirstName + " " + u.LastName).ToLower().Contains(term)))
            .Take(20)
            .Select(u => new UserSearchResult(u.Id, u.FirstName, u.LastName, u.Email))
            .ToListAsync();
    }

    public async Task UpdateMemberRoleAsync(Guid clubId, Guid userId, ClubRole newRole, Guid updatedBy)
    {
        var membership = await db.ClubMemberships
            .FirstOrDefaultAsync(m => m.ClubId == clubId && m.UserId == userId && m.IsActive)
            ?? throw new AppException("Member not found", 404);

        membership.Role = newRole;
        await db.SaveChangesAsync();
    }

    public async Task DeactivateMemberAsync(Guid clubId, Guid userId, Guid removedBy)
    {
        var membership = await db.ClubMemberships
            .FirstOrDefaultAsync(m => m.ClubId == clubId && m.UserId == userId && m.IsActive)
            ?? throw new AppException("Member not found", 404);

        membership.IsActive = false;
        await db.SaveChangesAsync();
    }

    private static InvitationDto MapToDto(ClubInvitation i)
        => new(i.Id, i.ClubId, i.InviteeId, i.Role, i.Status, i.CreatedAt);
}
