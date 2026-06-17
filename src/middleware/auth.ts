import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { unauthorized } from '../utils/response';

export interface AuthRequest extends Request {
  userId?: string;
  memberId?: string;
}

export function generateToken(memberId: string): string {
  return jwt.sign(
    { id: memberId, type: 'member' },
    config.jwtSecret as string,
    { expiresIn: config.jwtExpiresIn } as any
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return null;
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    unauthorized(res, '请先登录');
    return;
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    unauthorized(res, '登录已过期，请重新登录');
    return;
  }

  req.userId = decoded.id;
  req.memberId = decoded.id;
  next();
}

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      req.userId = decoded.id;
      req.memberId = decoded.id;
    }
  }

  next();
}
