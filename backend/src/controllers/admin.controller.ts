// backend/src/controllers/admin.controller.ts
import type { Request, Response, NextFunction } from 'express';
import * as svc from '../services/admin.service';

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { await fn(req, res); } catch (err) { next(err); }
  };

export const getPlatformStats = wrap(async (_req, res) => {
  res.json(await svc.getPlatformStats());
});

export const getAnalyticsOverview = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsOverview());
});
export const getAnalyticsLoans = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsLoans());
});
export const getAnalyticsAssets = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsAssets());
});
export const getAnalyticsGrowth = wrap(async (_req, res) => {
  res.json(await svc.getAnalyticsGrowth());
});

export const listClubs = wrap(async (req, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  res.json(await svc.listClubs(page, limit, search));
});

export const getClubDetail = wrap(async (req, res) => {
  res.json(await svc.getClubDetail(req.params.id));
});

export const updateClubStatus = wrap(async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    res.status(400).json({ statusCode: 400, error: 'Bad Request', message: 'is_active must be a boolean' });
    return;
  }
  await svc.updateClubStatus(req.params.id, is_active);
  res.json({ message: 'Club status updated' });
});

export const resetClubAdminPassword = wrap(async (req, res) => {
  const temp_password = await svc.resetClubAdminPassword(req.params.id);
  res.json({ temp_password });
});

export const listClubUsers = wrap(async (req, res) => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json(await svc.listClubUsers(req.params.id, page, limit));
});

export const updateUserStatus = wrap(async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    res.status(400).json({ statusCode: 400, error: 'Bad Request', message: 'is_active must be a boolean' });
    return;
  }
  await svc.updateUserStatus(req.params.id, req.params.uid, is_active);
  res.json({ message: 'User status updated' });
});

export const resetUserPassword = wrap(async (req, res) => {
  const temp_password = await svc.resetUserPassword(req.params.id, req.params.uid);
  res.json({ temp_password });
});

export const listClubAssets = wrap(async (req, res) => {
  const page  = Math.max(1, Number(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  res.json(await svc.listClubAssets(req.params.id, page, limit));
});

export const retireAsset = wrap(async (req, res) => {
  const { status } = req.body as { status?: string };
  if (status !== 'retired') {
    res.status(400).json({ statusCode: 400, error: 'Bad Request', message: 'status must be "retired"' });
    return;
  }
  await svc.retireAsset(req.params.id, req.params.aid);
  res.json({ message: 'Asset retired' });
});

export const deleteAsset = wrap(async (req, res) => {
  await svc.deleteAsset(req.params.id, req.params.aid);
  res.json({ message: 'Asset deleted' });
});

export const listClubLoans = wrap(async (req, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json(await svc.listClubLoans(req.params.id, page, limit, status));
});
