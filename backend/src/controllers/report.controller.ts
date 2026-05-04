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
    const data = await reportService.getLoanUsage(req.user.club_id as string, req.query);
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
