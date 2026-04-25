import type { RequestHandler } from 'express';
import * as clubService from '../services/club.service';
import AppError from '../utils/AppError';

export const getMyClub: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user.club_id) throw new AppError('You have not joined a club yet', 404);
    const club = await clubService.getClub(req.user.club_id);
    res.json(club);
  } catch (err) {
    next(err);
  }
};

export const updateMyClub: RequestHandler = async (req, res, next) => {
  try {
    const club = await clubService.updateClub(req.user.club_id as string, req.body);
    res.json(club);
  } catch (err) {
    next(err);
  }
};

export const uploadLogo: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file provided', 400);
    const result = await clubService.updateLogo(
      req.user.club_id as string, req.file.buffer, req.file.mimetype, req.file.originalname
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
};
