import type { RequestHandler } from 'express';
import * as notificationService from '../services/notification.service';

export const listNotifications: RequestHandler = async (req, res, next) => {
  try {
    const result = await notificationService.listNotifications(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const markAllRead: RequestHandler = async (req, res, next) => {
  try {
    const result = await notificationService.markAllRead(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const markRead: RequestHandler = async (req, res, next) => {
  try {
    const notification = await notificationService.markRead(req.params.id, req.user.id);
    res.json(notification);
  } catch (err) {
    next(err);
  }
};

export const registerToken: RequestHandler = async (req, res, next) => {
  try {
    await notificationService.registerToken(req.user.id, req.body.token, req.body.device_info);
    res.status(201).json({ message: 'FCM token registered' });
  } catch (err) {
    next(err);
  }
};

export const unregisterToken: RequestHandler = async (req, res, next) => {
  try {
    await notificationService.unregisterToken(req.user.id, req.body.token);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};
