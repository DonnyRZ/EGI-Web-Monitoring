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
import { CreateTicketDto, TicketsQueryDto, UpdateTicketDto } from "./tickets.dto";
import { TicketsService } from "./tickets.service";
import { CurrentUser, type AuthUser } from "../../common/current-user.decorator";

@ApiTags("Tickets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tickets")
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  list(@Query() query: TicketsQueryDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.list(query, query, user);
  }

  @Post()
  @HttpCode(201)
  @Roles(UserRole.developer, UserRole.helpdesk, UserRole.it_ops)
  create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ticketsService.get(id, user);
  }

  @Patch(":id")
  @Roles(UserRole.developer, UserRole.helpdesk, UserRole.it_ops)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    return this.ticketsService.update(id, dto);
  }
}
