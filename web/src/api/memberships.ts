import client from './client';
import type { PendingInvitation } from '../types';

export const getMyInvitations = () =>
  client.get<{ data: PendingInvitation[]; total: number }>('/invitations/mine');

export const acceptInvitation = (clubId: string, invitationId: string) =>
  client.post<{ message: string }>(`/clubs/${clubId}/invitations/${invitationId}/accept`);

export const declineInvitation = (clubId: string, invitationId: string) =>
  client.post<{ message: string }>(`/clubs/${clubId}/invitations/${invitationId}/decline`);
