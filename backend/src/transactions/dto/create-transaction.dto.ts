import { IsString, IsNumber, IsDateString, IsOptional, IsIn, Min, IsInt } from 'class-validator';

export class CreateTransactionDto {
  @IsInt()
  walletId: number;

  @IsInt()
  categoryId: number;

  @IsString()
  @IsIn(['income', 'expense'])
  type: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsIn(['USD', 'VES', 'EUR'])
  currency: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly', 'yearly'])
  recurrence?: string;
}