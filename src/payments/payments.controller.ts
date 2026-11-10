import { BadRequestException, Body, Controller, Headers, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('loans/:loanId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(201)
  async create(
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ) {
    if (!idempotencyKey || idempotencyKey.length === 0) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const { statusCode, body } = await this.payments.create(loanId, dto, idempotencyKey);
    res.status(statusCode).json(body);
  }
}
