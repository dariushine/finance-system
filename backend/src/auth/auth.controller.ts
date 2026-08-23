import { Body, Controller, Get, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("api/auth")
export class AuthController {
  constructor(private service: AuthService) {}

  @Get("status")
  status() {
    return { enabled: this.service.authEnabled };
  }

  @Post("login")
  login(@Body() dto: { username?: string; password?: string }) {
    return this.service.login(dto.username || "", dto.password || "");
  }
}
