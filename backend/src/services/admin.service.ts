// backend/src/services/admin.service.ts
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import * as db from '../db';
import AppError from '../utils/AppError';
import type { PaginatedResult } from '../types';

// ── Internal helpers ──────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), b => chars[b % chars.length]).join('');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformStats {
  total_clubs: number;
  active_clubs: number;
  total_users: number;
  total_assets: number;
  active_loans: number;
  overdue_loans: number;
}

export interface ClubListItem {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
  asset_count: number;
  active_loan_count: number;
}

export interface ClubAdminAccount {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface ClubDetail {
  id: string;
  name: string;
  sport_type: string | null;
  contact_email: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
  admin_account: ClubAdminAccount | null;
  stats: {
    user_count: number;
    asset_count: number;
    active_loan_count: number;
    overdue_loan_count: number;
  };
}

// ── Platform stats ────────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const { rows } = await db.query<{
    total_clubs: string; active_clubs: string; total_users: string;
    total_assets: string; active_loans: string; overdue_loans: string;
  }>(`
    SELECT
      (SELECT COUNT(*)                                          FROM clubs)                                             AS total_clubs,
      (SELECT COUNT(*)                                          FROM clubs WHERE is_active = true)                      AS active_clubs,
      (SELECT COUNT(*)                                          FROM users WHERE role != 'super_admin')                 AS total_users,
      (SELECT COALESCE(SUM(total_quantity), 0)                  FROM asset_batches)                                     AS total_assets,
      (SELECT COUNT(*)                                          FROM loans WHERE status = 'checked_out')                AS active_loans,
      (SELECT COUNT(*)  FROM loans WHERE status = 'checked_out' AND due_date < CURRENT_DATE)                           AS overdue_loans
  `);
  const r = rows[0];
  return {
    total_clubs:   Number(r.total_clubs),
    active_clubs:  Number(r.active_clubs),
    total_users:   Number(r.total_users),
    total_assets:  Number(r.total_assets),
    active_loans:  Number(r.active_loans),
    overdue_loans: Number(r.overdue_loans),
  };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalyticsOverview(clubId?: string): Promise<Record<string, unknown>> {
  if (clubId) {
    const { rows: statRows } = await db.query<{
      user_count: string; asset_count: string; active_loans: string; overdue_loans: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::int         FROM users       WHERE club_id = $1 AND role != 'super_admin')                                              AS user_count,
         (SELECT COALESCE(SUM(ab.total_quantity),0)::int FROM asset_batches ab JOIN asset_types at2 ON at2.id = ab.asset_type_id WHERE at2.club_id = $1) AS asset_count,
         (SELECT COUNT(*)::int         FROM loans       WHERE club_id = $1 AND status = 'checked_out')                                              AS active_loans,
         (SELECT COUNT(*)::int         FROM loans       WHERE club_id = $1 AND status = 'checked_out' AND due_date < CURRENT_DATE)                  AS overdue_loans`,
      [clubId]
    );
    const { rows: statusRows } = await db.query<{ status: string; total: string }>(
      `SELECT ab.status, COALESCE(SUM(ab.total_quantity), 0)::int AS total
       FROM asset_batches ab
       JOIN asset_types at2 ON at2.id = ab.asset_type_id
       WHERE at2.club_id = $1
       GROUP BY ab.status`,
      [clubId]
    );
    const { rows: valueRows } = await db.query<{ total_value: string }>(
      `SELECT COALESCE(SUM(ab.purchase_price * ab.total_quantity), 0) AS total_value
       FROM asset_batches ab
       JOIN asset_types at2 ON at2.id = ab.asset_type_id
       WHERE at2.club_id = $1`,
      [clubId]
    );
    const r = statRows[0];
    return {
      user_count:        Number(r.user_count),
      asset_count:       Number(r.asset_count),
      active_loans:      Number(r.active_loans),
      overdue_loans:     Number(r.overdue_loans),
      asset_by_status:   statusRows.map(s => ({ status: s.status, total: Number(s.total) })),
      total_asset_value: Number(valueRows[0].total_value),
    };
  }

  // platform-wide (original behaviour)
  const stats = await getPlatformStats();
  const { rows: statusRows } = await db.query<{ status: string; total: string }>(
    `SELECT status, COALESCE(SUM(total_quantity), 0)::int AS total FROM asset_batches GROUP BY status`
  );
  const { rows: valueRows } = await db.query<{ total_value: string }>(
    `SELECT COALESCE(SUM(purchase_price * total_quantity), 0) AS total_value FROM asset_batches`
  );
  return {
    ...stats,
    asset_by_status:   statusRows.map(r => ({ status: r.status, total: Number(r.total) })),
    total_asset_value: Number(valueRows[0].total_value),
  };
}

export async function getAnalyticsLoans(clubId?: string): Promise<Record<string, unknown>> {
  const clubFilter      = clubId ? 'AND l.club_id = $2'   : '';
  const clubFilterAsset = clubId ? 'AND at2.club_id = $1' : '';
  const trendParams: unknown[] = clubId ? [12, clubId] : [12];
  const topParams: unknown[]   = clubId ? [clubId]     : [];

  const { rows: trendRows } = await db.query<{ month: string; loan_count: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', l.created_at), 'YYYY-MM') AS month,
            COUNT(DISTINCT l.id)::int AS loan_count
     FROM loans l
     WHERE l.created_at >= NOW() - INTERVAL '1 month' * $1 ${clubFilter}
     GROUP BY 1 ORDER BY 1`,
    trendParams
  );
  const { rows: topRows } = await db.query<{ asset_name: string; loan_count: string }>(
    `SELECT an.name AS asset_name, COUNT(li.id)::int AS loan_count
     FROM loan_items li
     JOIN asset_types at2 ON at2.id = li.asset_type_id
     JOIN asset_names an  ON an.id  = at2.asset_name_id
     WHERE 1=1 ${clubFilterAsset}
     GROUP BY an.name ORDER BY loan_count DESC LIMIT 10`,
    topParams
  );
  return {
    monthly_trend: trendRows.map(r => ({ month: r.month, loan_count: Number(r.loan_count) })),
    top_assets:    topRows.map(r => ({ asset_name: r.asset_name, loan_count: Number(r.loan_count) })),
  };
}

export async function getAnalyticsAssets(clubId?: string): Promise<Record<string, unknown>> {
  const joinClub  = clubId ? 'JOIN asset_types at2 ON at2.id = ab.asset_type_id' : '';
  const whereClub = clubId ? 'WHERE at2.club_id = $1'                            : '';
  const params    = clubId ? [clubId]                                             : [];

  const { rows: statusRows } = await db.query<{
    status: string; batch_count: string; total_qty: string; total_value: string;
  }>(
    `SELECT ab.status,
            COUNT(*)::int                                           AS batch_count,
            COALESCE(SUM(ab.total_quantity), 0)::int               AS total_qty,
            COALESCE(SUM(ab.purchase_price * ab.total_quantity), 0) AS total_value
     FROM asset_batches ab
     ${joinClub}
     ${whereClub}
     GROUP BY ab.status`,
    params
  );
  const { rows: catRows } = await db.query<{
    category: string; type_count: string; total_qty: string; total_value: string;
  }>(
    `SELECT COALESCE(ac.name, 'Uncategorized')                      AS category,
            COUNT(DISTINCT at2.id)::int                              AS type_count,
            COALESCE(SUM(ab.total_quantity), 0)::int                 AS total_qty,
            COALESCE(SUM(ab.purchase_price * ab.total_quantity), 0)  AS total_value
     FROM asset_batches ab
     JOIN asset_types at2 ON at2.id = ab.asset_type_id
     JOIN asset_names an  ON an.id  = at2.asset_name_id
     LEFT JOIN asset_categories ac ON ac.id = an.category_id
     ${clubId ? 'WHERE at2.club_id = $1' : ''}
     GROUP BY ac.name ORDER BY total_qty DESC`,
    params
  );
  return {
    by_status:   statusRows.map(r => ({ status: r.status,   batch_count: Number(r.batch_count), total_qty: Number(r.total_qty), total_value: Number(r.total_value) })),
    by_category: catRows.map(r =>   ({ category: r.category, type_count: Number(r.type_count),  total_qty: Number(r.total_qty), total_value: Number(r.total_value) })),
  };
}

export async function getAnalyticsGrowth(): Promise<Record<string, unknown>> {
  const { rows: clubRows } = await db.query<{ month: string; new_clubs: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS new_clubs
     FROM clubs WHERE created_at >= NOW() - INTERVAL '12 months'
     GROUP BY 1 ORDER BY 1`
  );
  const { rows: userRows } = await db.query<{ month: string; new_users: string }>(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS new_users
     FROM users WHERE created_at >= NOW() - INTERVAL '12 months' AND role != 'super_admin'
     GROUP BY 1 ORDER BY 1`
  );
  return {
    clubs: clubRows.map(r => ({ month: r.month, new_clubs: Number(r.new_clubs) })),
    users: userRows.map(r => ({ month: r.month, new_users: Number(r.new_users) })),
  };
}

// ── Club management ───────────────────────────────────────────────────────────

export async function listClubs(
  page: number, limit: number, search?: string
): Promise<PaginatedResult<ClubListItem>> {
  const offset = (page - 1) * limit;
  const searchLike = search ? `%${search}%` : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    search ? `SELECT COUNT(*) FROM clubs WHERE name ILIKE $1` : `SELECT COUNT(*) FROM clubs`,
    search ? [searchLike] : []
  );
  const total = Number(countRows[0].count);

  const whereClause = search ? 'WHERE c.name ILIKE $1' : '';
  const paramOffset  = search ? 1 : 0;
  const { rows } = await db.query<ClubListItem>(
    `SELECT c.id, c.name, c.sport_type, c.contact_email, c.is_active, c.created_at,
            COUNT(DISTINCT u.id) FILTER (WHERE u.role != 'super_admin')::int AS user_count,
            COALESCE(SUM(ab.total_quantity), 0)::int                          AS asset_count,
            COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'checked_out')::int AS active_loan_count
     FROM clubs c
     LEFT JOIN users u       ON u.club_id       = c.id
     LEFT JOIN asset_types at2 ON at2.club_id   = c.id
     LEFT JOIN asset_batches ab ON ab.asset_type_id = at2.id
     LEFT JOIN loans l       ON l.club_id        = c.id
     ${whereClause}
     GROUP BY c.id ORDER BY c.created_at DESC
     LIMIT $${paramOffset + 1} OFFSET $${paramOffset + 2}`,
    search ? [searchLike, limit, offset] : [limit, offset]
  );
  return { data: rows, total, page, limit };
}

export async function getClubDetail(clubId: string): Promise<ClubDetail> {
  const { rows } = await db.query<{
    id: string; name: string; sport_type: string | null; contact_email: string;
    address: string | null; is_active: boolean; created_at: string;
    admin_id: string | null; admin_name: string | null; admin_email: string | null;
    admin_is_active: boolean | null; admin_email_verified: boolean | null;
    user_count: string; asset_count: string; active_loan_count: string; overdue_loan_count: string;
  }>(
    `SELECT c.id, c.name, c.sport_type, c.contact_email, c.address, c.is_active, c.created_at,
            u.id              AS admin_id,
            u.name            AS admin_name,
            u.email           AS admin_email,
            u.is_active       AS admin_is_active,
            u.email_verified  AS admin_email_verified,
            (SELECT COUNT(*)::int           FROM users u2      WHERE u2.club_id = c.id AND u2.role != 'super_admin') AS user_count,
            (SELECT COALESCE(SUM(ab.total_quantity),0)::int FROM asset_batches ab JOIN asset_types at2 ON at2.id = ab.asset_type_id WHERE at2.club_id = c.id) AS asset_count,
            (SELECT COUNT(*)::int           FROM loans l       WHERE l.club_id = c.id AND l.status = 'checked_out') AS active_loan_count,
            (SELECT COUNT(*)::int           FROM loans l       WHERE l.club_id = c.id AND l.status = 'checked_out' AND l.due_date < CURRENT_DATE) AS overdue_loan_count
     FROM clubs c
     LEFT JOIN LATERAL (
       SELECT id, name, email, is_active, email_verified
       FROM users
       WHERE club_id = c.id AND role = 'club_admin'
       ORDER BY created_at ASC
       LIMIT 1
     ) u ON true
     WHERE c.id = $1`,
    [clubId]
  );
  if (!rows.length) throw new AppError('Club not found', 404);
  const r = rows[0];
  return {
    id: r.id, name: r.name, sport_type: r.sport_type,
    contact_email: r.contact_email, address: r.address,
    is_active: r.is_active, created_at: r.created_at,
    admin_account: r.admin_id
      ? { id: r.admin_id, name: r.admin_name!, email: r.admin_email!, is_active: r.admin_is_active!, email_verified: r.admin_email_verified! }
      : null,
    stats: {
      user_count:         Number(r.user_count),
      asset_count:        Number(r.asset_count),
      active_loan_count:  Number(r.active_loan_count),
      overdue_loan_count: Number(r.overdue_loan_count),
    },
  };
}

export async function updateClubStatus(clubId: string, isActive: boolean): Promise<void> {
  const { rowCount } = await db.query(
    'UPDATE clubs SET is_active = $1 WHERE id = $2', [isActive, clubId]
  );
  if (!rowCount) throw new AppError('Club not found', 404);
}

export async function resetClubAdminPassword(clubId: string): Promise<string> {
  const temp = generateTempPassword();
  const hash = await bcrypt.hash(temp, 10);
  const { rowCount } = await db.query(
    `UPDATE users SET password_hash = $1 WHERE club_id = $2 AND role = 'club_admin'`,
    [hash, clubId]
  );
  if (!rowCount) throw new AppError('No club admin found for this club', 404);
  return temp;
}

// ── User management ───────────────────────────────────────────────────────────

export async function listClubUsers(
  clubId: string, page: number, limit: number
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * limit;
  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM users WHERE club_id = $1 AND role != 'super_admin'`, [clubId]
  );
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, name, email, role, is_active, email_verified, created_at
     FROM users WHERE club_id = $1 AND role != 'super_admin'
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [clubId, limit, offset]
  );
  return { data: rows, total: Number(countRows[0].count), page, limit };
}

export async function updateUserStatus(
  clubId: string, userId: string, isActive: boolean
): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE users SET is_active = $1 WHERE id = $2 AND club_id = $3`,
    [isActive, userId, clubId]
  );
  if (!rowCount) throw new AppError('User not found in this club', 404);
}

export async function resetUserPassword(clubId: string, userId: string): Promise<string> {
  const temp = generateTempPassword();
  const hash = await bcrypt.hash(temp, 10);
  const { rowCount } = await db.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2 AND club_id = $3`,
    [hash, userId, clubId]
  );
  if (!rowCount) throw new AppError('User not found in this club', 404);
  return temp;
}

// ── Asset management ──────────────────────────────────────────────────────────

export async function listClubAssets(
  clubId: string, page: number, limit: number
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * limit;
  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM asset_types WHERE club_id = $1`, [clubId]
  );
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT at2.id, an.name, at2.brand, at2.model, at2.size,
            COALESCE(SUM(ab.total_quantity), 0)::int       AS total_quantity,
            COALESCE(SUM(ab.available_quantity), 0)::int   AS available_quantity,
            CASE
              WHEN COALESCE(SUM(ab.total_quantity), 0) = 0    THEN 'retired'
              WHEN COALESCE(SUM(ab.available_quantity), 0) = 0 THEN 'on_loan'
              ELSE 'available'
            END AS status,
            at2.created_at
     FROM asset_types at2
     JOIN asset_names an ON an.id = at2.asset_name_id
     LEFT JOIN asset_batches ab ON ab.asset_type_id = at2.id
     WHERE at2.club_id = $1
     GROUP BY at2.id, an.name ORDER BY at2.created_at DESC
     LIMIT $2 OFFSET $3`,
    [clubId, limit, offset]
  );
  return { data: rows, total: Number(countRows[0].count), page, limit };
}

export async function retireAsset(clubId: string, assetTypeId: string): Promise<void> {
  const { rowCount } = await db.query(
    `UPDATE asset_batches SET status = 'retired'
     WHERE asset_type_id = $1
       AND asset_type_id IN (SELECT id FROM asset_types WHERE club_id = $2)`,
    [assetTypeId, clubId]
  );
  if (!rowCount) throw new AppError('Asset not found in this club', 404);
}

export async function deleteAsset(clubId: string, assetTypeId: string): Promise<void> {
  const { rows: checkRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM loan_items li
     JOIN loans l ON l.id = li.loan_id
     WHERE li.asset_type_id = $1 AND l.status NOT IN ('returned', 'rejected')`,
    [assetTypeId]
  );
  if (parseInt(checkRows[0].count) > 0) {
    throw new AppError('Cannot delete: asset has active or pending loans', 409);
  }
  const { rowCount } = await db.query(
    `DELETE FROM asset_types WHERE id = $1 AND club_id = $2`,
    [assetTypeId, clubId]
  );
  if (!rowCount) throw new AppError('Asset not found in this club', 404);
}

// ── Loan records ──────────────────────────────────────────────────────────────

export async function listClubLoans(
  clubId: string, page: number, limit: number, status?: string
): Promise<PaginatedResult<Record<string, unknown>>> {
  const offset = (page - 1) * limit;
  const extraWhere = status ? `AND l.status = $2` : '';
  const countParams: unknown[] = status ? [clubId, status] : [clubId];

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) FROM loans l WHERE l.club_id = $1 ${extraWhere}`, countParams
  );

  const dataParams: unknown[] = status ? [clubId, status, limit, offset] : [clubId, limit, offset];
  const limitIdx  = status ? 3 : 2;
  const offsetIdx = status ? 4 : 3;
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT l.id, l.status, l.due_date, l.created_at,
            u.name AS coach_name,
            COUNT(li.id)::int AS item_count
     FROM loans l
     JOIN users u ON u.id = l.coach_id
     LEFT JOIN loan_items li ON li.loan_id = l.id
     WHERE l.club_id = $1 ${extraWhere}
     GROUP BY l.id, u.name
     ORDER BY l.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams
  );
  return { data: rows, total: Number(countRows[0].count), page, limit };
}
