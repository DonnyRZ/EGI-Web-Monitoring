import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";
import { DashboardQueryDto, WebsiteDetailQueryDto } from "./dashboard.dto";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";

@ApiTags("Dashboard")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  main(@Query() query: DashboardQueryDto, @CurrentUser() user: AuthUser) {
    return this.dashboardService.main(user, query.status);
  }

  @Get("websites/:websiteId")
  detail(
    @Param("websiteId", ParseUUIDPipe) websiteId: string,
    @Query() query: WebsiteDetailQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboardService.detail(websiteId, query.history_limit ?? 48, user);
  }
}
