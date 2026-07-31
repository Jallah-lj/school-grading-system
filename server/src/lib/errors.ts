export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, message: string, code = 'APP_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(msg: string, details?: unknown) { return new AppError(400, msg, 'BAD_REQUEST', details); }
  static unauthorized(msg = 'Authentication required') { return new AppError(401, msg, 'UNAUTHORIZED'); }
  static forbidden(msg = 'Insufficient permissions') { return new AppError(403, msg, 'FORBIDDEN'); }
  static notFound(entity = 'Resource') { return new AppError(404, `${entity} not found`, 'NOT_FOUND'); }
  static conflict(msg: string, details?: unknown) { return new AppError(409, msg, 'CONFLICT', details); }
}
