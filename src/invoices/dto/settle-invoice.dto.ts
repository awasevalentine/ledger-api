import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class SettleInvoiceDto {
  @IsISO8601()
  settlementDate!: string;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'amountReceivedKobo must be an integer string' })
  amountReceivedKobo?: string;
}
