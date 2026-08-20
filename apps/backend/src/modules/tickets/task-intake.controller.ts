import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { TASK_INTAKE_CREATOR_ROLES_PRISMA } from "../../common/resource-access";
import { TicketsService } from "./tickets.service";
import { CreateTaskIntakeDto } from "./task-intake.dto";

@ApiTags("Task Intake")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("task-intake")
export class TaskIntakeController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @HttpCode(201)
  @Roles(...TASK_INTAKE_CREATOR_ROLES_PRISMA)
  create(@Body() dto: CreateTaskIntakeDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.createTaskIntake(dto, user);
  }
}
