import request from 'supertest';
import app from '../src/app';
import { authHeader, createClub, createUser, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_clubs_';
const adminEmail   = `${PREFIX}admin@test.com`;
const managerEmail = `${PREFIX}manager@test.com`;
let clubId: string;
let adminUserId: string;
let managerUserId: string;

beforeAll(async () => {
  clubId = await createClub('Clubs Test Club');
  const admin = await createUser(adminEmail, clubId, 'club_admin');
  adminUserId = admin.id;
  const manager = await createUser(managerEmail, clubId, 'asset_manager');
  managerUserId = manager.id;
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminEmail, managerEmail]);
});

describe('GET /api/v1/clubs/me', () => {
  it('returns club profile for admin', async () => {
    const res = await request(app)
      .get('/api/v1/clubs/me')
      .set(authHeader(adminUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: clubId, name: 'Clubs Test Club' });
  });

  it('returns club profile for manager', async () => {
    const res = await request(app)
      .get('/api/v1/clubs/me')
      .set(authHeader(managerUserId));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(clubId);
  });
});

describe('PUT /api/v1/clubs/me', () => {
  it('updates club info as admin', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ sport_type: 'Football', low_stock_threshold: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sport_type: 'Football', low_stock_threshold: 3 });
  });

  it('returns 403 when non-admin tries to update', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(managerUserId))
      .send({ sport_type: 'Basketball' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/auth/register — club registration flow', () => {
  const newClubName  = `${PREFIX}NewClub`;
  const newAdminEmail = `${PREFIX}creator@test.com`;

  afterAll(async () => {
    const { rows } = await (await import('../src/db')).query<{ id: string }>(
      `SELECT c.id FROM clubs c JOIN users u ON u.club_id = c.id WHERE u.email = $1`,
      [newAdminEmail]
    );
    if (rows.length) await (await import('../src/db')).query('DELETE FROM clubs WHERE id = $1', [rows[0].id]);
    await deleteUsers([newAdminEmail]);
  });

  it('creates a new club and makes the registrant a club_admin', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        club: { name: newClubName, contact_email: 'new@club.com', sport_type: 'Soccer' },
        user: { name: 'Brand New Admin', email: newAdminEmail, password: 'TestPass@123' },
      });
    expect(res.status).toBe(201);

    const { rows } = await (await import('../src/db')).query<{ role: string; club_id: string }>(
      'SELECT role, club_id FROM users WHERE email = $1',
      [newAdminEmail]
    );
    expect(rows[0].role).toBe('club_admin');
    expect(rows[0].club_id).toBeTruthy();
  });

  it('returns 400 when club name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        club: { contact_email: 'x@x.com' },
        user: { name: 'Test', email: `${PREFIX}noname@test.com`, password: 'TestPass@123' },
      });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/clubs/me — retirement alert settings', () => {
  it('updates retirement_alert_mode and retirement_alert_value', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ retirement_alert_mode: 'months', retirement_alert_value: 6 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      retirement_alert_mode:  'months',
      retirement_alert_value: 6,
    });
  });

  it('GET /clubs/me returns persisted retirement alert fields', async () => {
    const res = await request(app)
      .get('/api/v1/clubs/me')
      .set(authHeader(adminUserId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      retirement_alert_mode:  'months',
      retirement_alert_value: 6,
    });
  });

  it('rejects invalid retirement_alert_mode', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ retirement_alert_mode: 'invalid' });
    expect(res.status).toBe(422);
  });

  it('rejects non-numeric retirement_alert_value with 422', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ retirement_alert_value: 'notanumber' });
    expect(res.status).toBe(422);
  });

  it('preserves existing retirement_alert_value when only mode is sent', async () => {
    // First set a known state
    await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ retirement_alert_mode: 'percent', retirement_alert_value: 90 });

    // Update only the mode — value must remain 90
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminUserId))
      .send({ retirement_alert_mode: 'months' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      retirement_alert_mode:  'months',
      retirement_alert_value: 90,
    });
  });
});
