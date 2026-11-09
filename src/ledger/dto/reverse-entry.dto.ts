import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class ReverseEntryDto {
  @IsISO8601()
  entryDate!: string;

  @IsOptional()
  @IsString()
  memo?: string;
}
