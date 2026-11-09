import { IsISO8601, IsInt, Matches, Max, Min } from 'class-validator';

export class CreateLoanDto {
  @Matches(/^\d+$/, { message: 'principalKobo must be an integer string' })
  principalKobo!: string;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  annualRateBps!: number;

  @IsInt()
  @Min(1)
  @Max(600)
  termMonths!: number;

  @IsISO8601()
  disbursementDate!: string;
}
