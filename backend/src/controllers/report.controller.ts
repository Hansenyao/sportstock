import type { RequestHandler } from 'express';
import * as reportService from '../services/report.service';

export const getSummary: RequestHandler = async (req, res, next) => {
  try {
    const data = await reportService.getSummary(req.user.club_id as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const getDepreciation: RequestHandler = async (req, res, next) => {
  try {
    const data = await reportService.getDepreciationReport(req.user.club_id as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const getLoanUsage: RequestHandler = async (req, res, next) => {
  try {
    const team_id   = typeof req.query.team_id   === 'string' ? req.query.team_id   : undefined;
    const from_date = typeof req.query.from_date  === 'string' ? req.query.from_date  : undefined;
    const to_date   = typeof req.query.to_date    === 'string' ? req.query.to_date    : undefined;
    const data = await reportService.getLoanUsage(req.user.club_id as string, { team_id, from_date, to_date });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const getMovements: RequestHandler = async (req, res, next) => {
  try {
    const data = await reportService.getMovementsSummary(req.user.club_id as string, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const getAlerts: RequestHandler = async (req, res, next) => {
  try {
    const data = await reportService.getAlerts(req.user.club_id as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const getRecentMovements: RequestHandler = async (req, res, next) => {
  try {
    const data = await reportService.getRecentMovements(req.user.club_id as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
};
