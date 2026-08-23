import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from "@nestjs/common";
import { WalletsService } from "./wallets.service";

@Controller("api/wallets")
export class WalletsController {
  constructor(private wallets: WalletsService) {}

  @Get()
  list() {
    return this.wallets.list();
  }

  @Post()
  create(
    @Body()
    dto: {
      name: string;
      type: string;
      currency: string;
      balance?: number;
      alias?: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ) {
    return this.wallets.create(dto);
  }

  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    dto: {
      name?: string;
      balance?: number;
      alias?: string;
      description?: string;
      icon?: string;
      color?: string;
    },
  ) {
    return this.wallets.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.wallets.remove(id);
  }
}
