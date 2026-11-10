import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { ReverseEntryDto } from './dto/reverse-entry.dto';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('trial-balance')
  async trialBalance(@Query('asOf') asOf?: string) {
    const rows = await this.ledger.trialBalance(asOf);
    return { asOf: asOf ?? null, rows };
  }

  @Post('entries/:id/reverse')
  async reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseEntryDto) {
    const entry = await this.ledger.reverseEntryStandalone(id, {
      entryDate: dto.entryDate,
      memo: dto.memo,
    });
    return { entry };
  }
}
