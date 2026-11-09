import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LedgerService } from './ledger.service';
import { ReverseEntryDto } from './dto/reverse-entry.dto';

@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  @Get('trial-balance')
  async trialBalance(@Query('asOf') asOf?: string) {
    const rows = await this.ledger.trialBalance(asOf);
    return { asOf: asOf ?? null, rows };
  }

  @Post('entries/:id/reverse')
  @HttpCode(201)
  async reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseEntryDto) {
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const entry = await this.ledger.reverseEntry(qr, id, { entryDate: dto.entryDate, memo: dto.memo });
      await qr.commitTransaction();
      return { entry };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }
}
