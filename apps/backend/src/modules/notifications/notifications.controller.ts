import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { NotificationsQueryDto } from "./notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationsQueryDto) {
    return this.notificationsService.list(user.id, query, query);
  }

  @Post("read-all")
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notificationsService.readAll(user.id);
  }

  @Post(":id/read")
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(user.id, id);
  }
}
