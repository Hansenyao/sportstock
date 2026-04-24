import request from 'supertest';
import app from '../src/app';
import { query } from '../src/db';
import { authHeader, createClub, createUser, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_clubs_';
const adminId = `${PREFIX}admin`;
const managerId = `${PREFIX}manager`;
let clubId: string;

beforeAll(async () => {
  clubId = await createClub('Clubs Test Club');
  await createUser(adminId, clubId, 'club_admin');
  await createUser(managerId, clubId, 'asset_manager');
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminId, managerId]);
});

describe('GET /api/v1/clubs/me', () => {
  it('returns club profile for admin', async () => {
    const res = await request(app)
      .get('/api/v1/clubs/me')
      .set(authHeader(adminId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: clubId, name: 'Clubs Test Club' });
  });

  it('returns club profile for manager', async () => {
    const res = await request(app)
      .get('/api/v1/clubs/me')
      .set(authHeader(managerId));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(clubId);
  });
});

describe('PUT /api/v1/clubs/me', () => {
  it('updates club info as admin', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(adminId))
      .send({ sport_type: 'Football', low_stock_threshold: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sport_type: 'Football', low_stock_threshold: 3 });
  });

  it('returns 403 when non-admin tries to update', async () => {
    const res = await request(app)
      .put('/api/v1/clubs/me')
      .set(authHeader(managerId))
      .send({ sport_type: 'Basketball' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/clubs — club registration flow', () => {
  const creatorId = `${PREFIX}creator`;
  let newClubId: string;

  beforeAll(async () => {
    // super_admin is the only role that can have club_id = NULL (DB constraint)
    await createUser(creatorId, null, 'super_admin');
  });

  afterAll(async () => {
    if (newClubId) await deleteClub(newClubId);
    await deleteUsers([creatorId]);
  });

  it('creates a new club and promotes caller to club_admin', async () => {
    const res = await request(app)
      .post('/api/v1/clubs')
      .set(authHeader(creatorId))
      .send({ name: 'Brand New Club', contact_email: 'new@club.com', sport_type: 'Soccer' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Brand New Club' });
    newClubId = res.body.id;

    // Verify the caller's role was updated
    const profile = await request(app)
      .get('/api/v1/auth/me')
      .set(authHeader(creatorId));
    expect(profile.body.role).toBe('club_admin');
    expect(profile.body.club_id).toBe(newClubId);
  });

  it('returns 400 when name is missing', async () => {
    const tempId = `${PREFIX}noname`;
    await createUser(tempId, null, 'super_admin');
    let tempClubId: string | undefined;
    try {
      const res = await request(app)
        .post('/api/v1/clubs')
        .set(authHeader(tempId))
        .send({ contact_email: 'x@x.com' });
      expect(res.status).toBe(400);
      tempClubId = res.body?.id;
    } finally {
      if (tempClubId) await deleteClub(tempClubId);
      await deleteUsers([tempId]);
    }
  });
});
