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
import { RolesGuard } from "../../common/roles.guard";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";
import {
  CreateUserStoryDto,
  UpdateUserStoryDto,
  UserStoriesQueryDto,
} from "./user-stories.dto";
import { UserStoriesService } from "./user-stories.service";

@ApiTags("User Stories")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class UserStoriesController {
  constructor(private readonly userStoriesService: UserStoriesService) {}

  @Get("user-stories")
  list(@Query() query: UserStoriesQueryDto, @CurrentUser() user: AuthUser) {
    return this.userStoriesService.list(query, query, user);
  }

  @Get("user-stories/:id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.userStoriesService.get(id, user);
  }

  @Patch("user-stories/:id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.userStoriesService.update(id, dto, user);
  }

  @Get("projects/:projectId/user-stories")
  listForProject(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Query() query: UserStoriesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.userStoriesService.listForProject(projectId, query, query, user);
  }

  @Post("projects/:projectId/user-stories")
  @HttpCode(201)
  create(
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateUserStoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.userStoriesService.create(projectId, dto, user);
  }

  @Post("tickets/:ticketId/create-story")
  @HttpCode(201)
  createFromTicket(
    @Param("ticketId", ParseUUIDPipe) ticketId: string,
    @Body() dto: CreateUserStoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.userStoriesService.createFromTicket(ticketId, dto, user);
  }

  @Get("me/work")
  meWork(@CurrentUser() user: AuthUser) {
    return this.userStoriesService.meWork(user);
  }
}
