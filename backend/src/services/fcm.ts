import admin from 'firebase-admin';
import * as db from '../db';
import config from '../config';

function getMessaging(): admin.messaging.Messaging {
  if (!admin.apps.length) {
    const { projectId, privateKey, clientEmail } = config.firebase;
    if (!projectId || !privateKey || !clientEmail) {
      throw new Error('Firebase credentials not configured');
    }
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, privateKey, clientEmail }),
    });
  }
  return admin.messaging();
}

function toStringMap(obj: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, String(v)])
  );
}

async function pruneInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.query('DELETE FROM fcm_tokens WHERE token = ANY($1)', [tokens]);
}

export async function sendToUser(
  userId: string,
  notification: { title: string; body: string },
  data: Record<string, unknown> = {}
): Promise<void> {
  const { rows } = await db.query<{ token: string }>(
    'SELECT token FROM fcm_tokens WHERE user_id = $1',
    [userId]
  );
  if (rows.length === 0) return;

  const tokens = rows.map((r) => r.token);
  const response = await getMessaging().sendEachForMulticast({
    notification: { title: notification.title, body: notification.body },
    data: toStringMap(data),
    tokens,
  });

  const invalid: string[] = [];
  response.responses.forEach((resp: admin.messaging.SendResponse, idx: number) => {
    const code = resp.error?.code ?? '';
    if (
      !resp.success &&
      (code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered')
    ) {
      invalid.push(tokens[idx]);
    }
  });
  await pruneInvalidTokens(invalid);
}

export async function sendToClub(
  clubId: string,
  roles: string[],
  notification: { title: string; body: string },
  data: Record<string, unknown> = {}
): Promise<void> {
  const { rows } = await db.query<{ token: string }>(
    `SELECT DISTINCT ft.token
     FROM fcm_tokens ft
     JOIN users u ON u.id = ft.user_id
     WHERE u.club_id = $1 AND u.role = ANY($2) AND u.is_active = true`,
    [clubId, roles]
  );
  if (rows.length === 0) return;

  const tokens = rows.map((r) => r.token);
  const response = await getMessaging().sendEachForMulticast({
    notification: { title: notification.title, body: notification.body },
    data: toStringMap(data),
    tokens,
  });

  const invalid: string[] = [];
  response.responses.forEach((resp: admin.messaging.SendResponse, idx: number) => {
    const code = resp.error?.code ?? '';
    if (
      !resp.success &&
      (code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered')
    ) {
      invalid.push(tokens[idx]);
    }
  });
  await pruneInvalidTokens(invalid);
}
