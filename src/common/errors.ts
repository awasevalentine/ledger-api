import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(typeof body === 'string' ? { message: body } : body);
      return;
    }

    const canonical = this.toCanonical422(exception);
    if (canonical) {
      this.logger.warn(`${req?.method} ${req?.url} -> 422 ${canonical}`);
      res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: canonical,
      });
      return;
    }

    this.logger.error(`${req?.method} ${req?.url} -> 500`, exception instanceof Error ? exception.stack : exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'internal server error',
    });
  }

  private toCanonical422(exception: unknown): string | null {
    if (!(exception instanceof QueryFailedError)) return null;
    const msg = exception.message;
    if (/is unbalanced/i.test(msg)) return 'journal entry must balance';
    if (/fewer than 2 lines|at least 2 lines/i.test(msg)) return 'journal entry must have at least two lines';
    if (/append-only/i.test(msg)) return 'journal entries and lines are append-only';
    if (/closed period/i.test(msg)) return 'entry date falls in a closed period';
    if (/posted_in_period .* does not match/i.test(msg)) return 'entry posted_in_period does not match entry_date';
    if (/closed period .* cannot be reopened/i.test(msg)) return 'closed period cannot be reopened';
    return null;
  }
}
