import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";
import { WebsiteDetailQueryDto } from "./dashboard.dto";

@ApiTags("Dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  main() {
    return this.dashboardService.main();
  }

  @Get("websites/:websiteId")
  detail(
    @Param("websiteId", ParseUUIDPipe) websiteId: string,
    @Query() query: WebsiteDetailQueryDto,
  ) {
    return this.dashboardService.detail(websiteId, query.history_limit ?? 48);
  }
}
