import client from './client';
import type { PendingInvitation, ClubRole } from '../types';

export const getMyInvitations = () =>
  client.get<{ data: PendingInvitation[]; total: number }>('/invitations/mine');

export const acceptInvitation = (clubId: string, invitationId: string) =>
  client.post<{ message: string }>(`/clubs/${clubId}/invitations/${invitationId}/accept`);

export const declineInvitation = (clubId: string, invitationId: string) =>
  client.post<{ message: string }>(`/clubs/${clubId}/invitations/${invitationId}/decline`);

export interface ClubInvitation {
  id: string;
  invitee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: ClubRole;
  status: string;
  created_at: string;
}

export const listClubInvitations = (clubId: string) =>
  client.get<ClubInvitation[]>(`/clubs/${clubId}/invitations`);

export const sendInvitation = (clubId: string, inviteeId: string, role: ClubRole) =>
  client.post(`/clubs/${clubId}/invitations`, { invitee_id: inviteeId, role });

export const cancelClubInvitation = (clubId: string, invitationId: string) =>
  client.delete(`/clubs/${clubId}/invitations/${invitationId}`);
