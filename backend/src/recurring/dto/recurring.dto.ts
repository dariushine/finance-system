import { Type } from "class-transformer";
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class CreateRecurringDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee?: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsIn(["income", "expense"])
  type!: "income" | "expense";

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  walletId?: number;
}

export class UpdateRecurringDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsIn(["income", "expense"])
  type?: "income" | "expense";

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  walletId?: number;
}

export class ExecuteRecurringDto {
  @Matches(DATE_RE, { message: "La fecha debe ser YYYY-MM-DD" })
  date!: string;

  @Matches(TIME_RE, { message: "La hora debe ser HH:MM" })
  time!: string;

  @IsOptional()
  @IsString()
  tz?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  walletId?: number;

  // Overrides opcionales que el front permite al ejecutar un pago recurrente
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  overrideAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overrideFee?: number;

  @IsOptional()
  @IsString()
  overrideCategoryName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  overrideWalletId?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
