import type { RequestHandler } from 'express';
import type { UserRole } from '../types';

function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        statusCode: 403,
        error: 'Forbidden',
        message: `This action requires role: ${roles.join(' or ')}`,
      });
      return;
    }
    next();
  };
}

export default requireRole;
