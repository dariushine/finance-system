import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(["income", "expense"])
  type!: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
