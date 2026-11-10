import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { QuoteInvoiceDto } from './dto/quote-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SettleInvoiceDto } from './dto/settle-invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteInvoiceDto) {
    return this.invoices.quote(dto);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.load(id);
  }

  @Post(':id/settle')
  settle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SettleInvoiceDto) {
    return this.invoices.settle(id, dto);
  }
}
