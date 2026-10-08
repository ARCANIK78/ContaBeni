import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Registro duplicado' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Registro no encontrado' },
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Operación inválida: registro relacionado inexistente',
  },
  P2021: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Tabla inexistente en la base de datos',
  },
  P2022: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Columna inexistente en la base de datos',
  },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Error interno del servidor';
    let message: string | string[] = 'Error interno del servidor';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        error = (b.error as string) ?? exception.name;
        details = b.details;
      }
      if (status >= 500) {
        this.logger.error(exception.message, exception.stack);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERROR_MAP[exception.code];
      if (mapped) {
        status = mapped.status;
        error =
          status === HttpStatus.CONFLICT ? 'Conflicto' : 'Solicitud inválida';
        message =
          exception.code === 'P2002'
            ? `${mapped.message}: ${JSON.stringify(
                exception.meta?.target ?? {},
              )}`
            : mapped.message;
      } else {
        this.logger.error(`Prisma error ${exception.code}`, exception.message);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
