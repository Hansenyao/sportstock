import type { RequestHandler } from 'express';
import * as authService from '../services/auth.service';

export const register: RequestHandler = async (req, res, next) => {
  try {
    await authService.register(req.body);
    res.status(201).json({ message: 'Registration successful. Please check your email for the verification code.' });
  } catch (err) {
    next(err);
  }
};

export const verifyEmail: RequestHandler = async (req, res, next) => {
  try {
    const { email, code } = req.body as { email: string; code: string };
    await authService.verifyEmail(email, code);
    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
};

export const resendVerification: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body as { email: string };
    if (!email) {
      res.status(400).json({ statusCode: 400, error: 'Bad Request', message: 'email is required' });
      return;
    }
    await authService.sendVerificationCode(email, 'registration');
    res.json({ message: 'Verification code resent.' });
  } catch (err) {
    next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    const { email } = req.body as { email: string };
    await authService.forgotPassword(email);
    res.json({ message: 'If this email is registered, a reset code has been sent.' });
  } catch (err) {
    next(err);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const { email, code, new_password } = req.body as {
      email: string;
      code: string;
      new_password: string;
    };
    await authService.resetPassword(email, code, new_password);
    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    next(err);
  }
};

export const getMe: RequestHandler = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    next(err);
  }
};

export const changePassword: RequestHandler = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body as {
      current_password: string;
      new_password: string;
    };
    await authService.changePassword(req.user.id, current_password, new_password);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    next(err);
  }
};
