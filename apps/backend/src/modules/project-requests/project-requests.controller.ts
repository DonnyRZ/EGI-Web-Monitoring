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
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import {
  PROJECT_REQUEST_CREATOR_ROLES_PRISMA,
  PROJECT_REQUEST_REVIEWER_ROLES_PRISMA,
} from "../../common/resource-access";
import {
  ApproveProjectRequestDto,
  CreateProjectRequestDto,
  ProjectRequestReviewNoteDto,
  ProjectRequestsQueryDto,
  UpdateProjectRequestDto,
} from "./project-requests.dto";
import { ProjectRequestsService } from "./project-requests.service";

@ApiTags("Project Requests")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("project-requests")
export class ProjectRequestsController {
  constructor(private readonly projectRequestsService: ProjectRequestsService) {}

  @Get()
  list(@Query() query: ProjectRequestsQueryDto, @CurrentUser() user: AuthUser) {
    return this.projectRequestsService.list(query, user);
  }

  @Post()
  @HttpCode(201)
  @Roles(...PROJECT_REQUEST_CREATOR_ROLES_PRISMA)
  create(@Body() dto: CreateProjectRequestDto, @CurrentUser() user: AuthUser) {
    return this.projectRequestsService.create(dto, user);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projectRequestsService.get(id, user);
  }

  @Get(":id/attachment")
  getAttachment(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.projectRequestsService.getAttachmentSignedUrl(id, user);
  }

  @Patch(":id")
  @Roles(...PROJECT_REQUEST_CREATOR_ROLES_PRISMA)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectRequestsService.update(id, dto, user);
  }

  @Post(":id/request-info")
  @Roles(...PROJECT_REQUEST_REVIEWER_ROLES_PRISMA)
  requestInfo(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ProjectRequestReviewNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectRequestsService.requestInfo(id, dto, user);
  }

  @Post(":id/reject")
  @Roles(...PROJECT_REQUEST_REVIEWER_ROLES_PRISMA)
  reject(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ProjectRequestReviewNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectRequestsService.reject(id, dto, user);
  }

  @Post(":id/approve")
  @Roles(...PROJECT_REQUEST_REVIEWER_ROLES_PRISMA)
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ApproveProjectRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projectRequestsService.approve(id, dto, user);
  }
}
