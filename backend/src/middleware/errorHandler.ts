import type { Request, Response, NextFunction } from 'express';

function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const anyErr = err as Record<string, unknown>;

  if (process.env.NODE_ENV !== 'production' || !anyErr.statusCode) {
    console.error(err);
  }

  const statusCode = (typeof anyErr.statusCode === 'number' ? anyErr.statusCode : 500);
  res.status(statusCode).json({
    statusCode,
    error: typeof anyErr.error === 'string' ? anyErr.error : 'Internal Server Error',
    message: typeof anyErr.message === 'string' ? anyErr.message : 'An unexpected error occurred',
  });
}

export default errorHandler;
