import request from 'supertest';
import app from '../src/app';
import { query } from '../src/db';
import { authHeader, createClub, createUser, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_auth_';
let clubId: string;
let adminUserId: string;
const adminId = `${PREFIX}admin`;
const coachId = `${PREFIX}coach`;

beforeAll(async () => {
  clubId = await createClub('Auth Test Club');
  const admin = await createUser(adminId, clubId, 'club_admin');
  adminUserId = admin.id;
  await createUser(coachId, clubId, 'coach');
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminId, coachId]);
});

describe('GET /api/v1/auth/me', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401 });
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token-format');
    expect(res.status).toBe(401);
  });

  it('returns profile for existing club_admin', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(adminId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      role: 'club_admin',
      club_id: clubId,
    });
  });

  it('returns profile for existing coach', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'coach' });
  });

  it('auto-creates profile for invited first-time user', async () => {
    const newId = `${PREFIX}new_user`;
    const email = `${newId}@test.com`;
    // Seed a pending invite so the DB constraint (club_id required) is satisfied
    await query(
      `INSERT INTO user_invites (club_id, invited_by, email, role) VALUES ($1, $2, $3, 'coach')`,
      [clubId, adminUserId, email]
    );
    try {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(newId));
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('coach');
      expect(res.body.club_id).toBe(clubId);
    } finally {
      await query('DELETE FROM users WHERE clerk_id = $1', [newId]);
      await query('DELETE FROM user_invites WHERE email = $1', [email]);
    }
  });
});
