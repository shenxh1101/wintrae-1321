import { Response } from 'express';
import { ApiResponse } from '../types';

export function success<T = any>(res: Response, data: T, message: string = '操作成功'): Response {
  const result: ApiResponse<T> = {
    code: 0,
    message,
    data
  };
  return res.status(200).json(result);
}

export function fail(res: Response, message: string = '操作失败', code: number = 1, httpStatus: number = 400): Response {
  const result: ApiResponse = {
    code,
    message,
    data: null
  };
  return res.status(httpStatus).json(result);
}

export function unauthorized(res: Response, message: string = '未授权访问'): Response {
  return fail(res, message, 401, 401);
}

export function forbidden(res: Response, message: string = '权限不足'): Response {
  return fail(res, message, 403, 403);
}

export function notFound(res: Response, message: string = '资源不存在'): Response {
  return fail(res, message, 404, 404);
}

export function serverError(res: Response, message: string = '服务器内部错误'): Response {
  return fail(res, message, 500, 500);
}

export function paginated<T = any>(
  res: Response,
  list: T[],
  total: number,
  page: number,
  pageSize: number,
  message: string = '查询成功'
): Response {
  return success(res, {
    list,
    total,
    page,
    pageSize
  }, message);
}
