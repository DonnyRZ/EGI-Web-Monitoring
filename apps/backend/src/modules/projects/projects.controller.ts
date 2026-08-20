import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../../common/roles.guard";
import { Roles } from "../../common/roles.decorator";
import { PROJECT_ADMIN_ROLES_PRISMA } from "../../common/resource-access";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import {
  AddProjectWebsiteDto,
  CreateProjectDto,
  ProjectsQueryDto,
  UpdateProjectAssignmentsDto,
  UpdateProjectDto,
  UpdateProjectWebsitesDto,
} from "./projects.dto";
import { ProjectsService } from "./projects.service";

@ApiTags("Projects")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(@Query() query: ProjectsQueryDto, @CurrentUser() user: AuthUser) {
    return this.projectsService.list(query, query, user);
  }

  @Get("roster")
  @Roles(...PROJECT_ADMIN_ROLES_PRISMA)
  roster(@Query("role") role: "pic_web" | "developer", @CurrentUser() user: AuthUser) {
    if (role !== "pic_web" && role !== "developer") {
      role = "developer";
    }
    return this.projectsService.roster(role, user);
  }

  @Get("summary/scope")
  scopeSummary(@CurrentUser() user: AuthUser) {
    return this.projectsService.scopeSummary(user);
  }

  @Post()
  @HttpCode(201)
  @Roles(...PROJECT_ADMIN_ROLES_PRISMA)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projectsService.create(dto, user);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projectsService.get(id, user);
  }

  @Patch(":id")
  @Roles(...PROJECT_ADMIN_ROLES_PRISMA)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.update(id, dto, user);
  }

  @Put(":id/assignments")
  @Roles(...PROJECT_ADMIN_ROLES_PRISMA)
  updateAssignments(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectAssignmentsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.updateAssignments(id, dto, user);
  }

  @Put(":id/websites")
  @Roles(...PROJECT_ADMIN_ROLES_PRISMA)
  updateWebsites(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectWebsitesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.updateWebsites(id, dto, user);
  }

  @Post(":id/websites")
  @HttpCode(201)
  @Roles(...PROJECT_ADMIN_ROLES_PRISMA)
  addWebsite(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddProjectWebsiteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.addWebsite(id, dto, user);
  }

  @Delete(":id/websites/:websiteId")
  @HttpCode(200)
  @Roles(...PROJECT_ADMIN_ROLES_PRISMA)
  removeWebsite(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("websiteId", ParseUUIDPipe) websiteId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectsService.removeWebsite(id, websiteId, user);
  }
}
