import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

interface ErrorBody {
  error?: string;
  message?: string | string[];
  [key: string]: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const httpException =
      exception instanceof HttpException ? exception : undefined;
    const status =
      httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const body = httpException?.getResponse();
    const detail = typeof body === 'object' ? (body as ErrorBody) : {};
    const message = Array.isArray(detail.message)
      ? detail.message.join(', ')
      : (detail.message ??
        (typeof body === 'string' ? body : 'Internal server error'));
    const additionalFields = Object.fromEntries(
      Object.entries(detail).filter(
        ([key]) => !['error', 'message', 'statusCode'].includes(key),
      ),
    );

    this.logger.error(
      { err: exception, status, path: request.url },
      'Request failed',
    );
    response.status(status).json({
      statusCode: status,
      error: detail.error ?? HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR',
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...additionalFields,
    });
  }
}
