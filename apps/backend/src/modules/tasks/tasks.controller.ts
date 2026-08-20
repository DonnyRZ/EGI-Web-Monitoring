import {
  Body,
  Controller,
  Get,
  GoneException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@egi/database";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import { TasksQueryDto, UpdateTaskStatusDto } from "./tasks.dto";
import { TasksService } from "./tasks.service";

@ApiTags("Tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * Keep an explicit response during the deprecation window so old clients
   * fail safely instead of silently creating a second kind of work item.
   */
  @Post()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createDisabled(@CurrentUser() _user: AuthUser): never {
    throw new GoneException(
      "Legacy Task creation is disabled. Use the Task Intake workspace instead.",
    );
  }

  @Get()
  @Roles(UserRole.superadmin, UserRole.developer, UserRole.bos_it, UserRole.pic_web)
  list(@Query() query: TasksQueryDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.list(query, query, user);
  }

  @Patch(":id/status")
  @Roles(UserRole.superadmin, UserRole.developer)
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.updateStatus(id, dto, user);
  }
}
