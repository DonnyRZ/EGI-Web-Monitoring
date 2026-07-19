import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MonitoringHistoryQueryDto } from "./monitoring.dto";
import { MonitoringService } from "./monitoring.service";

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
  ) {
    return this.monitoringService.listByWebsite(websiteId, query, query);
  }

  @Get("websites/:websiteId/monitoring-results/latest")
  latest(@Param("websiteId", ParseUUIDPipe) websiteId: string) {
    return this.monitoringService.latest(websiteId);
  }

  @Get("monitoring-results/:id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.monitoringService.get(id);
  }

  @Get("monitoring-results/:id/screenshot")
  screenshot(@Param("id", ParseUUIDPipe) id: string) {
    return this.monitoringService.getScreenshotSignedUrl(id);
  }
}
