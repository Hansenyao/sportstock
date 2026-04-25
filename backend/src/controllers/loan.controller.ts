import type { RequestHandler } from 'express';
import * as loanService from '../services/loan.service';

export const listLoans: RequestHandler = async (req, res, next) => {
  try {
    const result = await loanService.listLoans(req.user.club_id as string, req.user.id, req.user.role, req.query);
    res.json(result);
  } catch (err) { next(err); }
};

export const createLoan: RequestHandler = async (req, res, next) => {
  try {
    const loan = await loanService.createLoan(req.user.club_id as string, req.user.id, req.user.role, req.body);
    res.status(201).json(loan);
  } catch (err) { next(err); }
};

export const getLoan: RequestHandler = async (req, res, next) => {
  try {
    const loan = await loanService.getLoan(req.params.id, req.user.club_id as string, req.user.id, req.user.role);
    res.json(loan);
  } catch (err) { next(err); }
};

export const approveLoan: RequestHandler = async (req, res, next) => {
  try {
    const loan = await loanService.approveLoan(req.params.id, req.user.id, req.user.club_id as string);
    res.json(loan);
  } catch (err) { next(err); }
};

export const rejectLoan: RequestHandler = async (req, res, next) => {
  try {
    const loan = await loanService.rejectLoan(req.params.id, req.user.id, req.user.club_id as string, req.body.reason);
    res.json(loan);
  } catch (err) { next(err); }
};

export const checkoutLoan: RequestHandler = async (req, res, next) => {
  try {
    const loan = await loanService.checkoutLoan(req.params.id, req.user.id);
    res.json(loan);
  } catch (err) { next(err); }
};

export const initiateReturn: RequestHandler = async (req, res, next) => {
  try {
    const result = await loanService.initiateReturn(req.params.id, req.user.id, req.user.name, req.user.club_id as string);
    res.json(result);
  } catch (err) { next(err); }
};

export const confirmReturn: RequestHandler = async (req, res, next) => {
  try {
    const { condition, notes, returned_quantity } = req.body as {
      condition: string;
      notes?: string;
      returned_quantity: number;
    };
    const loan = await loanService.confirmReturn(
      req.params.id, req.user.id, req.user.club_id as string,
      condition, Number(returned_quantity), notes
    );
    res.json(loan);
  } catch (err) { next(err); }
};
