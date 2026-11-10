import { IsISO8601, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePaymentDto {
  @Matches(/^\d+$/, { message: 'amountKobo must be an integer string' })
  amountKobo!: string;

  @IsISO8601()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}
