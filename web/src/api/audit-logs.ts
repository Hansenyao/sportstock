import client from './client';

export interface AuditLog {
  id: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  user_id?: string | null;
  performed_by?: string | null;
  ip_address?: string | null;
  meta?: unknown;
  created_at: string;
}

export interface AuditLogsQuery {
  from?: string;
  to?: string;
  action?: string;
  entity_type?: string;
  page?: number;
  limit?: number;
}

export const getClubAuditLogs = (params: AuditLogsQuery) =>
  client.get<{ data: AuditLog[]; total: number; page: number; limit: number }>(
    '/audit-logs',
    { params }
  );
