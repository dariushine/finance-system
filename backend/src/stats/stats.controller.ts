import { Controller, Get } from "@nestjs/common";
import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private service: StatsService) {}

  @Get()
  overview() {
    return this.service.overview();
  }

  @Get("by-category")
  byCategory() {
    return this.service.byCategory();
  }
}
