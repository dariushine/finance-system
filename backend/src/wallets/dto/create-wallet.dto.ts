import { IsString, IsNumber, IsOptional, IsIn, Min } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  name: string;

  @IsString()
  @IsIn(['crypto', 'bank', 'cash', 'card', 'investment'])
  type: string;

  @IsString()
  @IsIn(['USD', 'VES', 'EUR'])
  currency: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  balance?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;
}