import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { PLATFORM_ADMIN_ROLES_PRISMA } from "../../common/resource-access";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import { CreateTaskDto, TasksQueryDto, UpdateTaskStatusDto } from "./tasks.dto";
import { TasksService } from "./tasks.service";

@ApiTags("Tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(201)
  @Roles(...PLATFORM_ADMIN_ROLES_PRISMA, UserRole.developer)
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.create(dto, user);
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
