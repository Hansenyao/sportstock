import request from 'supertest';
import app from '../src/app';
import { query } from '../src/db';
import { authHeader, createClub, createUser, deleteClub, deleteUsers } from './helpers';

const PREFIX = 't_notif_';
let clubId: string;
let userId_db: string;
const adminId = `${PREFIX}admin`;
const coachId = `${PREFIX}coach`;

beforeAll(async () => {
  clubId = await createClub('Notif Test Club');
  await createUser(adminId, clubId, 'club_admin');
  const coach = await createUser(coachId, clubId, 'coach');
  userId_db = coach.id;

  // Seed one notification for the coach
  await query(
    `INSERT INTO notifications (club_id, user_id, type, title, body)
     VALUES ($1, $2, 'loan_approved', 'Test Notif', 'You have a notification')`,
    [clubId, userId_db]
  );
});

afterAll(async () => {
  await deleteClub(clubId);
  await deleteUsers([adminId, coachId]);
});

describe('GET /api/v1/notifications', () => {
  it('returns notifications for current user', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: expect.any(Array) });
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty list when user has no notifications', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set(authHeader(adminId));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('PUT /api/v1/notifications/read-all', () => {
  it('marks all notifications as read', async () => {
    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set(authHeader(coachId));
    expect(res.status).toBe(200);

    // Verify they're now read
    const check = await request(app)
      .get('/api/v1/notifications?unread=true')
      .set(authHeader(coachId));
    expect(check.status).toBe(200);
  });
});

describe('PUT /api/v1/notifications/:id/read', () => {
  let notifId: string;

  beforeAll(async () => {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO notifications (club_id, user_id, type, title)
       VALUES ($1, $2, 'loan_request', 'Single Read Test') RETURNING id`,
      [clubId, userId_db]
    );
    notifId = rows[0].id;
  });

  it('marks a single notification as read', async () => {
    const res = await request(app)
      .put(`/api/v1/notifications/${notifId}/read`)
      .set(authHeader(coachId));
    expect(res.status).toBe(200);
    expect(res.body.is_read).toBe(true);
  });
});

describe('FCM token management', () => {
  const testToken = `test-fcm-token-${Date.now()}`;

  it('POST /notifications/fcm-token — registers device token', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/fcm-token')
      .set(authHeader(coachId))
      .send({ token: testToken });
    expect(res.status).toBe(201);
  });

  it('DELETE /notifications/fcm-token — unregisters device token', async () => {
    const res = await request(app)
      .delete('/api/v1/notifications/fcm-token')
      .set(authHeader(coachId))
      .send({ token: testToken });
    expect(res.status).toBe(204);
  });
});
