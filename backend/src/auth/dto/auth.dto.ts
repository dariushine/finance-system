import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  remember?: boolean;
}

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
