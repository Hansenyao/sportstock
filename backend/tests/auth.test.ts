import request from 'supertest';
import app from '../src/app';
import { query } from '../src/db';
import { authHeader, createClub, createUser, deleteClub, deleteUsers, TEST_PASSWORD } from './helpers';

const PREFIX = 't_auth_';
const adminEmail   = `${PREFIX}admin@test.com`;
const coachEmail   = `${PREFIX}coach@test.com`;
let clubId: string;
let adminUserId: string;
let coachUserId: string;

beforeAll(async () => {
  clubId = await createClub('Auth Test Club');
  const admin = await createUser(adminEmail, clubId, 'club_admin');
  adminUserId = admin.id;
  const coach = await createUser(coachEmail, clubId, 'coach');
  coachUserId = coach.id;
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminEmail, coachEmail]);
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
      .set(authHeader(adminUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'club_admin', club_id: clubId });
  });

  it('returns profile for existing coach', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(coachUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'coach' });
  });
});

describe('POST /api/v1/auth/register', () => {
  const newClubName = `${PREFIX}NewClub`;
  const newUserEmail = `${PREFIX}newuser@test.com`;
  let registeredClubId: string;

  afterAll(async () => {
    // Delete by email cascade-deletes the club via ON DELETE CASCADE on users doesn't help here,
    // so we query for the club and delete it
    const { rows } = await query<{ id: string }>(
      `SELECT c.id FROM clubs c
       JOIN users u ON u.club_id = c.id
       WHERE u.email = $1`,
      [newUserEmail]
    );
    if (rows.length) await query('DELETE FROM clubs WHERE id = $1', [rows[0].id]);
    await deleteUsers([newUserEmail]);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        club: { name: newClubName, contact_email: 'club@test.com' },
        user: { name: 'Test Admin', email: newUserEmail, password: '123' },
      });
    expect(res.status).toBe(400);
  });

  it('creates club and admin user, returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        club: { name: newClubName, contact_email: 'club@test.com', sport_type: 'Soccer' },
        user: { name: 'Test Admin', email: newUserEmail, password: 'TestPass@123' },
      });
    expect(res.status).toBe(201);
    expect(res.body.message).toContain('verification');

    const { rows } = await query<{ id: string; role: string; email_verified: boolean }>(
      'SELECT id, role, email_verified FROM users WHERE email = $1',
      [newUserEmail]
    );
    expect(rows[0].role).toBe('club_admin');
    expect(rows[0].email_verified).toBe(false);
  });

  it('returns 409 when email is already registered', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        club: { name: 'Another Club', contact_email: 'another@test.com' },
        user: { name: 'Duplicate', email: newUserEmail, password: 'TestPass@123' },
      });
    expect(res.status).toBe(409);
  });

  it('returns 409 when club name already exists', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        club: { name: newClubName, contact_email: 'x@test.com' },
        user: { name: 'Another Admin', email: `${PREFIX}another@test.com`, password: 'TestPass@123' },
      });
    expect(res.status).toBe(409);
    await deleteUsers([`${PREFIX}another@test.com`]);
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  const verifyEmail = `${PREFIX}verify@test.com`;

  beforeAll(async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        club: { name: `${PREFIX}VerifyClub`, contact_email: 'verify@test.com' },
        user: { name: 'Verify User', email: verifyEmail, password: 'TestPass@123' },
      });
  });

  afterAll(async () => {
    const { rows } = await query<{ id: string }>(
      `SELECT c.id FROM clubs c JOIN users u ON u.club_id = c.id WHERE u.email = $1`,
      [verifyEmail]
    );
    if (rows.length) await query('DELETE FROM clubs WHERE id = $1', [rows[0].id]);
    await deleteUsers([verifyEmail]);
    await query('DELETE FROM email_verifications WHERE email = $1', [verifyEmail]);
  });

  it('returns 400 for invalid code', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: verifyEmail, code: '000000' });
    expect(res.status).toBe(400);
  });

  it('verifies email with correct code', async () => {
    const { rows } = await query<{ code: string }>(
      `SELECT code FROM email_verifications
       WHERE email = $1 AND type = 'registration' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [verifyEmail]
    );
    expect(rows.length).toBe(1);

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: verifyEmail, code: rows[0].code });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/auth/login', () => {
  const loginEmail = `${PREFIX}login@test.com`;
  let loginUserId: string;

  beforeAll(async () => {
    const user = await createUser(loginEmail, clubId, 'coach');
    loginUserId = user.id;
  });

  afterAll(async () => {
    await deleteUsers([loginEmail]);
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: loginEmail, password: 'WrongPassword' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('returns JWT and user on successful login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: loginEmail, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      token: expect.any(String),
      user: { id: loginUserId, email: loginEmail, role: 'coach' },
    });
  });
});

describe('POST /api/v1/auth/forgot-password + reset-password', () => {
  const resetEmail = `${PREFIX}reset@test.com`;

  beforeAll(async () => {
    await createUser(resetEmail, clubId, 'coach');
  });

  afterAll(async () => {
    await deleteUsers([resetEmail]);
    await query('DELETE FROM email_verifications WHERE email = $1', [resetEmail]);
  });

  it('forgot-password responds 200 regardless of email existence', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nonexistent@test.com' });
    expect(res.status).toBe(200);
  });

  it('reset-password fails with wrong code', async () => {
    await request(app).post('/api/v1/auth/forgot-password').send({ email: resetEmail });
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: resetEmail, code: '000000', new_password: 'NewPass@123' });
    expect(res.status).toBe(400);
  });

  it('reset-password succeeds with correct code and new password works', async () => {
    await request(app).post('/api/v1/auth/forgot-password').send({ email: resetEmail });

    const { rows } = await query<{ code: string }>(
      `SELECT code FROM email_verifications
       WHERE email = $1 AND type = 'password_reset' AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [resetEmail]
    );
    expect(rows.length).toBe(1);

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: resetEmail, code: rows[0].code, new_password: 'NewPass@123456' });
    expect(resetRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: resetEmail, password: 'NewPass@123456' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
  });
});

describe('PUT /api/v1/auth/password', () => {
  it('changes password when current password is correct', async () => {
    const res = await request(app)
      .put('/api/v1/auth/password')
      .set(authHeader(coachUserId))
      .send({ current_password: TEST_PASSWORD, new_password: 'Changed@456' });
    expect(res.status).toBe(200);

    // Restore original password for other tests
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: coachEmail, password: 'Changed@456' });
    const token = loginRes.body.token;

    await request(app)
      .put('/api/v1/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'Changed@456', new_password: TEST_PASSWORD });
  });

  it('returns 400 when current password is wrong', async () => {
    const res = await request(app)
      .put('/api/v1/auth/password')
      .set(authHeader(adminUserId))
      .send({ current_password: 'wrong-password', new_password: 'NewPass@123' });
    expect(res.status).toBe(400);
  });
});
