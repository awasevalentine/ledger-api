import { IsISO8601, Matches } from 'class-validator';

export class CreateInvoiceDto {
  @Matches(/^\d+$/, { message: 'faceValueKobo must be an integer string' })
  faceValueKobo!: string;

  @IsISO8601()
  issueDate!: string;

  @IsISO8601()
  dueDate!: string;
}
