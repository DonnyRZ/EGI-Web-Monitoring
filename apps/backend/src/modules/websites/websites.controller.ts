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
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@egi/database";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { CreateWebsiteDto, UpdateWebsiteDto, WebsitesQueryDto } from "./websites.dto";
import { WebsitesService } from "./websites.service";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";

@ApiTags("Websites")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("websites")
export class WebsitesController {
  constructor(private readonly websitesService: WebsitesService) {}

  @Get()
  list(@Query() query: WebsitesQueryDto, @CurrentUser() user: AuthUser) {
    return this.websitesService.list(query, query, user);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.it_ops)
  create(@Body() dto: CreateWebsiteDto) {
    return this.websitesService.create(dto);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.websitesService.get(id, user);
  }

  @Patch(":id")
  @Roles(UserRole.it_ops)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateWebsiteDto) {
    return this.websitesService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  @Roles(UserRole.it_ops)
  async deactivate(@Param("id", ParseUUIDPipe) id: string) {
    await this.websitesService.deactivate(id);
  }
}
