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
import { CategoriesService } from "./categories.service";

@Controller("api/categories")
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  create(@Body() dto: { name: string; type: string; color?: string }) {
    return this.categories.create(dto);
  }

  @Put(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: { name?: string; color?: string },
  ) {
    return this.categories.update(id, dto);
  }

  @Put(":id/reactivate")
  reactivate(@Param("id", ParseIntPipe) id: number) {
    return this.categories.reactivate(id);
  }

  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.categories.remove(id);
  }
}
