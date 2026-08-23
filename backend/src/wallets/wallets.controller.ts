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
import { CreateWalletDto, UpdateWalletDto } from "./dto/wallet.dto";

@Controller("api/wallets")
export class WalletsController {
  constructor(private wallets: WalletsService) {}

  @Get()
  list() {
    return this.wallets.list();
  }

  // /deleted debe declararse ANTES de /:id para no ser capturado por el param
  @Get("deleted")
  listDeleted() {
    return this.wallets.listDeleted();
  }

  @Get(":id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.wallets.findById(id);
  }

  @Get(":id/report")
  report(@Param("id", ParseIntPipe) id: number) {
    return this.wallets.report(id);
  }

  @Post()
  create(@Body() dto: CreateWalletDto) {
    return this.wallets.create(dto);
  }

  @Put(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateWalletDto) {
    return this.wallets.update(id, dto);
  }

  @Put(":id/reactivate")
  reactivate(@Param("id", ParseIntPipe) id: number) {
    return this.wallets.reactivate(id);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.wallets.remove(id);
  }
}
