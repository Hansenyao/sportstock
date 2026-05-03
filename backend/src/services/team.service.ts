import * as db from '../db';
import AppError from '../utils/AppError';

const VALID_GENDERS   = ['Boys', 'Girls', 'Mixed'] as const;
const VALID_AGE_GROUPS = [
  'U4','U5','U6','U7','U8','U9','U10','U11',
  'U12','U13','U14','U15','U16','U17','U18','U19','U20','U21','Adult',
] as const;
const VALID_TEAM_ROLES = ['head_coach', 'assistant_coach', 'team_manager'] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertTeamBelongsToClub(teamId: string, clubId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM teams WHERE id = $1 AND club_id = $2',
    [teamId, clubId]
  );
  if (!rows.length) throw new AppError('Team not found', 404);
}

async function fetchMembers(teamId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT tm.id, tm.user_id, tm.team_role, tm.created_at,
            u.name, u.email, u.phone
     FROM   team_members tm
     JOIN   users u ON u.id = tm.user_id
     WHERE  tm.team_id = $1
     ORDER BY
       CASE tm.team_role WHEN 'head_coach' THEN 1 WHEN 'assistant_coach' THEN 2 ELSE 3 END,
       u.name ASC`,
    [teamId]
  );
  return rows;
}

// ── List ─────────────────────────────────────────────────────────────────────

export async function listTeams(clubId: string): Promise<Record<string, unknown>[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT t.*,
            COUNT(tm.id)::int AS member_count
     FROM   teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     WHERE  t.club_id = $1
     GROUP BY t.id
     ORDER BY t.name ASC`,
    [clubId]
  );
  return rows;
}

// ── Get (with full member list) ───────────────────────────────────────────────

export async function getTeam(teamId: string, clubId: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM teams WHERE id = $1 AND club_id = $2',
    [teamId, clubId]
  );
  if (!rows.length) throw new AppError('Team not found', 404);
  const members = await fetchMembers(teamId);
  return { ...rows[0], members };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createTeam(
  clubId: string,
  { name, gender, age_group }: { name: string; gender: string; age_group: string }
): Promise<Record<string, unknown>> {
  if (!name?.trim())                         throw new AppError('name is required', 400);
  if (!VALID_GENDERS.includes(gender as never))     throw new AppError(`gender must be one of: ${VALID_GENDERS.join(', ')}`, 400);
  if (!VALID_AGE_GROUPS.includes(age_group as never)) throw new AppError(`age_group must be one of: ${VALID_AGE_GROUPS.join(', ')}`, 400);

  const { rows } = await db.query<Record<string, unknown>>(
    `INSERT INTO teams (club_id, name, gender, age_group)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [clubId, name.trim(), gender, age_group]
  );
  return { ...rows[0], members: [] };
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateTeam(
  teamId: string,
  clubId: string,
  { name, gender, age_group }: { name?: string; gender?: string; age_group?: string }
): Promise<Record<string, unknown>> {
  if (gender    && !VALID_GENDERS.includes(gender as never))       throw new AppError(`gender must be one of: ${VALID_GENDERS.join(', ')}`, 400);
  if (age_group && !VALID_AGE_GROUPS.includes(age_group as never)) throw new AppError(`age_group must be one of: ${VALID_AGE_GROUPS.join(', ')}`, 400);

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE teams
     SET name      = COALESCE($1, name),
         gender    = COALESCE($2, gender),
         age_group = COALESCE($3, age_group)
     WHERE id = $4 AND club_id = $5
     RETURNING *`,
    [name?.trim() ?? null, gender ?? null, age_group ?? null, teamId, clubId]
  );
  if (!rows.length) throw new AppError('Team not found', 404);
  const members = await fetchMembers(teamId);
  return { ...rows[0], members };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteTeam(teamId: string, clubId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    'DELETE FROM teams WHERE id = $1 AND club_id = $2 RETURNING id',
    [teamId, clubId]
  );
  if (!rows.length) throw new AppError('Team not found', 404);
}

// ── Add member ────────────────────────────────────────────────────────────────

export async function addMember(
  teamId: string,
  clubId: string,
  userId: string,
  teamRole: string
): Promise<Record<string, unknown>> {
  if (!VALID_TEAM_ROLES.includes(teamRole as never))
    throw new AppError(`team_role must be one of: ${VALID_TEAM_ROLES.join(', ')}`, 400);

  await assertTeamBelongsToClub(teamId, clubId);

  const { rows: userRows } = await db.query<{ role: string }>(
    'SELECT role FROM users WHERE id = $1 AND club_id = $2 AND is_active = true',
    [userId, clubId]
  );
  if (!userRows.length) throw new AppError('User not found', 404);
  if (userRows[0].role !== 'coach') throw new AppError('Only coaches can be assigned to teams', 400);

  // Friendly error before hitting the DB unique constraint
  if (teamRole === 'head_coach') {
    const { rows: hcRows } = await db.query<{ id: string }>(
      `SELECT id FROM team_members WHERE team_id = $1 AND team_role = 'head_coach'`,
      [teamId]
    );
    if (hcRows.length) throw new AppError('This team already has a Head Coach', 409);
  }

  try {
    const { rows } = await db.query<Record<string, unknown>>(
      `INSERT INTO team_members (team_id, user_id, team_role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [teamId, userId, teamRole]
    );
    return rows[0];
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505')
      throw new AppError('This coach is already a member of this team', 409);
    throw err;
  }
}

// ── Update member role ────────────────────────────────────────────────────────

export async function updateMember(
  teamId: string,
  clubId: string,
  userId: string,
  teamRole: string
): Promise<Record<string, unknown>> {
  if (!VALID_TEAM_ROLES.includes(teamRole as never))
    throw new AppError(`team_role must be one of: ${VALID_TEAM_ROLES.join(', ')}`, 400);

  await assertTeamBelongsToClub(teamId, clubId);

  if (teamRole === 'head_coach') {
    const { rows: hcRows } = await db.query<{ user_id: string }>(
      `SELECT user_id FROM team_members WHERE team_id = $1 AND team_role = 'head_coach'`,
      [teamId]
    );
    if (hcRows.length && hcRows[0].user_id !== userId)
      throw new AppError('This team already has a Head Coach', 409);
  }

  const { rows } = await db.query<Record<string, unknown>>(
    `UPDATE team_members SET team_role = $1
     WHERE team_id = $2 AND user_id = $3
     RETURNING *`,
    [teamRole, teamId, userId]
  );
  if (!rows.length) throw new AppError('Team member not found', 404);
  return rows[0];
}

// ── Remove member ─────────────────────────────────────────────────────────────

export async function removeMember(
  teamId: string,
  clubId: string,
  userId: string
): Promise<void> {
  await assertTeamBelongsToClub(teamId, clubId);
  const { rows } = await db.query<{ id: string }>(
    'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING id',
    [teamId, userId]
  );
  if (!rows.length) throw new AppError('Team member not found', 404);
}
