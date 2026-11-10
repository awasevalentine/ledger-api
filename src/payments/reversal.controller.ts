import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ReversalService } from './reversal.service';
import { ReversePaymentDto } from './dto/reverse-payment.dto';

@Controller('payments')
export class ReversalController {
  constructor(private readonly reversal: ReversalService) {}

  @Post(':id/reverse')
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReversePaymentDto) {
    return this.reversal.reverse(id, {
      reason: dto.reason,
      effectiveDate: dto.effectiveDate,
      amountKobo: dto.amountKobo,
    });
  }
}
