import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MonitoringHistoryQueryDto } from "./monitoring.dto";
import { MonitoringService } from "./monitoring.service";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";

@ApiTags("Monitoring")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get("websites/:websiteId/monitoring-results")
  listByWebsite(
    @Param("websiteId", ParseUUIDPipe) websiteId: string,
    @Query() query: MonitoringHistoryQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.monitoringService.listByWebsite(websiteId, query, query, user);
  }

  @Get("websites/:websiteId/monitoring-results/latest")
  latest(@Param("websiteId", ParseUUIDPipe) websiteId: string, @CurrentUser() user: AuthUser) {
    return this.monitoringService.latest(websiteId, user);
  }

  @Get("monitoring-results/:id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.monitoringService.get(id, user);
  }

  @Get("monitoring-results/:id/screenshot")
  screenshot(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.monitoringService.getScreenshotSignedUrl(id, user);
  }
}
