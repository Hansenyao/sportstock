import type { RequestHandler } from 'express';
import * as authService from '../services/auth.service';

export const getMe: RequestHandler = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
};
