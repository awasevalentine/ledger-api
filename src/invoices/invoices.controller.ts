import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { QuoteInvoiceDto } from './dto/quote-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SettleInvoiceDto } from './dto/settle-invoice.dto';
import { quoteInvoice } from '../domain/invoice';
import { kobo } from '../money/money';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteInvoiceDto) {
    const q = quoteInvoice({
      faceValueKobo: kobo(dto.faceValueKobo),
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      settlementDate: dto.settlementDate,
    });
    return {
      faceValueKobo: q.faceValueKobo.toString(),
      advanceKobo: q.advanceKobo.toString(),
      reserveKobo: q.reserveKobo.toString(),
      tenorDays: q.tenorDays,
      discountFeeKobo: q.discountFeeKobo.toString(),
      daysOverdue: q.daysOverdue,
      latePenaltyKobo: q.latePenaltyKobo.toString(),
      payableToClientKobo: q.payableToClientKobo.toString(),
      clientShortfallKobo: q.clientShortfallKobo.toString(),
    };
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.load(id);
  }

  @Post(':id/settle')
  @HttpCode(201)
  settle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleInvoiceDto) {
    return this.invoices.settle(id, dto);
  }
}
