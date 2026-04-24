import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';

async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ statusCode: 401, error: 'Unauthorized', message: 'Missing Bearer token' });
      return;
    }

    const payload = authService.verifyToken(authHeader.slice(7));
    const user = await authService.getUserById(payload.sub);

    if (!user.is_active) {
      res.status(403).json({ statusCode: 403, error: 'Forbidden', message: 'Account is deactivated' });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

export default authenticate;
