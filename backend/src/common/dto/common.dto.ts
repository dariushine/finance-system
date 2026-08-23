import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Matches } from "class-validator";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateDailyRateDto {
  @Matches(DATE_RE, { message: "La fecha debe ser YYYY-MM-DD" })
  date!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  bcv!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  paralelo!: number;

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdateDailyRateDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  bcv?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  paralelo?: number;

  @IsOptional()
  @IsString()
  source?: string;
}

export class SetTimezoneDto {
  @IsString()
  timezone!: string;
}
