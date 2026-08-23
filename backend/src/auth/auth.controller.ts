import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CreateTokenDto, LoginDto } from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private service: AuthService) {}

  @Get("status")
  status() {
    return { enabled: this.service.authEnabled };
  }

  @Get("session")
  session(@Req() req: Request) {
    return {
      authenticated: Boolean(req.cookies?.access_token),
      disabled: !this.service.authEnabled,
    };
  }

  @Post("login")
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.login(
      dto.username,
      dto.password,
      Boolean(dto.remember),
      res,
    );
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    return this.service.logout(res);
  }

  @Post("refresh")
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.service.refresh(req, res);
  }

  @Get("sessions")
  listSessions() {
    return this.service.listSessions();
  }

  @Delete("sessions/:jti")
  revokeSession(@Param("jti") jti: string) {
    return this.service.revokeSession(jti);
  }

  @Get("tokens")
  listTokens() {
    return this.service.listTokens();
  }

  @Post("tokens")
  createToken(@Body() dto: CreateTokenDto) {
    return this.service.createToken(dto.name);
  }

  @Delete("tokens/:id")
  revokeToken(@Param("id") id: string) {
    return this.service.revokeToken(Number(id));
  }
}
