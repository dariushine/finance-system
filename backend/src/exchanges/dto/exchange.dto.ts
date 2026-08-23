import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export class CreateExchangeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  fromWalletId!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  toWalletId!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  fromAmount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  toAmount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditFee?: number;

  @Matches(DATE_RE, { message: "La fecha debe ser YYYY-MM-DD" })
  date!: string;

  @Matches(TIME_RE, { message: "La hora debe ser HH:MM" })
  time!: string;

  @IsOptional()
  @IsString()
  tz?: string;
}

export class UpdateExchangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  fromAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  toAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  creditFee?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Matches(DATE_RE)
  date?: string;

  @IsOptional()
  @Matches(TIME_RE)
  time?: string;

  @IsOptional()
  @IsString()
  tz?: string;
}
