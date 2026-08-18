import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import { TaskMonitoringService } from "./task-monitoring.service";
import { TaskMonitoringQueryDto, UpdateTaskMonitoringStatusDto } from "./task-monitoring.dto";

@ApiTags("Task Monitoring")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("task-monitoring")
export class TaskMonitoringController {
  constructor(private readonly service: TaskMonitoringService) {}

  @Get("filters")
  filters(@CurrentUser() user: AuthUser) {
    return this.service.filters(user);
  }

  @Get()
  list(@Query() query: TaskMonitoringQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.list(query, user);
  }

  @Get(":id")
  get(
    @Param("id") id: string,
    @Query("source") source: "task" | "legacy_task" | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.get(id, source, user);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskMonitoringStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateStatus(id, dto, user);
  }
}
