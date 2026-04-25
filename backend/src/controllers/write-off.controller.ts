import type { RequestHandler } from 'express';
import * as writeOffService from '../services/write-off.service';

export const listWriteOffs: RequestHandler = async (req, res, next) => {
  try {
    const result = await writeOffService.listWriteOffs(req.user.club_id as string, req.query);
    res.json(result);
  } catch (err) { next(err); }
};

export const getWriteOff: RequestHandler = async (req, res, next) => {
  try {
    const record = await writeOffService.getWriteOff(req.params.id, req.user.club_id as string);
    res.json(record);
  } catch (err) { next(err); }
};

export const createWriteOff: RequestHandler = async (req, res, next) => {
  try {
    const record = await writeOffService.createWriteOff(
      req.user.club_id as string, req.user.id, req.body
    );
    res.status(201).json(record);
  } catch (err) { next(err); }
};
