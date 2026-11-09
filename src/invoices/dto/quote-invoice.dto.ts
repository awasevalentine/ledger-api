import { IsISO8601, IsOptional, Matches } from 'class-validator';

export class QuoteInvoiceDto {
  @Matches(/^\d+$/, { message: 'faceValueKobo must be an integer string' })
  faceValueKobo!: string;

  @IsISO8601()
  issueDate!: string;

  @IsISO8601()
  dueDate!: string;

  @IsOptional()
  @IsISO8601()
  settlementDate?: string;
}
