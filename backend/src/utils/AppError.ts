const STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

class AppError extends Error {
  statusCode: number;
  error: string;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.error = STATUS_NAMES[statusCode] ?? 'Error';
  }
}

export default AppError;
