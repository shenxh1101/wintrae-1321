import { Request, Response, NextFunction } from 'express';
import { serverError, fail } from '../utils/response';

export class AppError extends Error {
  public code: number;
  public httpStatus: number;

  constructor(message: string, code: number = 1, httpStatus: number = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[ERROR]', err);

  if (err instanceof AppError) {
    fail(res, err.message, err.code, err.httpStatus);
    return;
  }

  if (err.name === 'ValidationError') {
    fail(res, err.message, 400, 400);
    return;
  }

  serverError(res, err.message || '服务器内部错误');
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: 404,
    message: `请求的路径 ${req.method} ${req.path} 不存在`,
    data: null
  });
}
