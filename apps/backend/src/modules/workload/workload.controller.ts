import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { WORKLOAD_VIEWER_ROLES_PRISMA } from "../../common/resource-access";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import { WorkloadService } from "./workload.service";

@ApiTags("Workload")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...WORKLOAD_VIEWER_ROLES_PRISMA)
@Controller("workload")
export class WorkloadController {
  constructor(private readonly workloadService: WorkloadService) {}

  @Get("developers")
  developers(@CurrentUser() user: AuthUser) {
    return this.workloadService.developers(user);
  }
}
