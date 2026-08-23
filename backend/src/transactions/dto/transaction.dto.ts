import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

// Fecha YYYY-MM-DD y hora HH:MM estrictas.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class CreateTransactionDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  walletId!: number;

  @IsString()
  @IsNotEmpty()
  categoryName!: string;

  @IsIn(["income", "expense"])
  @IsNotEmpty()
  type!: "income" | "expense";

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee?: number;

  @Matches(DATE_RE, { message: "La fecha debe ser YYYY-MM-DD" })
  date!: string;

  @Matches(TIME_RE, { message: "La hora debe ser HH:MM" })
  time!: string;

  @IsOptional()
  @IsString()
  tz?: string;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @Matches(DATE_RE, { message: "La fecha debe ser YYYY-MM-DD" })
  date?: string;

  @IsOptional()
  @Matches(TIME_RE, { message: "La hora debe ser HH:MM" })
  time?: string;

  @IsOptional()
  @IsString()
  categoryName?: string;

  @IsOptional()
  @IsString()
  tz?: string;
}

export class AddFeeDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @Matches(DATE_RE, { message: "La fecha debe ser YYYY-MM-DD" })
  date!: string;

  @Matches(TIME_RE, { message: "La hora debe ser HH:MM" })
  time!: string;

  @IsOptional()
  @IsString()
  tz?: string;
}

export class AssociateTransactionDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsIn(["income", "expense"])
  type!: "income" | "expense";

  @IsString()
  @IsNotEmpty()
  categoryName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Matches(DATE_RE, { message: "La fecha debe ser YYYY-MM-DD" })
  date!: string;

  @Matches(TIME_RE, { message: "La hora debe ser HH:MM" })
  time!: string;

  @IsOptional()
  @IsString()
  tz?: string;
}
