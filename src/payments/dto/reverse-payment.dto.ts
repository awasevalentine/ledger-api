import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

export class ReversePaymentDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsISO8601()
  effectiveDate!: string;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'amountKobo must be an integer string' })
  amountKobo?: string;
}
