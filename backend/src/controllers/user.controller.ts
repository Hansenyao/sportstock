import type { RequestHandler } from 'express';
import * as userService from '../services/user.service';

export const listUsers: RequestHandler = async (req, res, next) => {
  try {
    const result = await userService.listUsers(req.user.club_id as string, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const getUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await userService.getUser(req.params.id, req.user.club_id as string);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export const updateUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.user.club_id as string, req.body);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

export const deactivateUser: RequestHandler = async (req, res, next) => {
  try {
    await userService.deactivateUser(req.params.id, req.user.club_id as string, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const createUser: RequestHandler = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.user.club_id as string, req.body);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
};
