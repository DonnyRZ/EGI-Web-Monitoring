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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../../common/roles.decorator";
import { RolesGuard } from "../../common/roles.guard";
import { TICKET_MANAGER_ROLES_PRISMA } from "../../common/resource-access";
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

  @Post("attachments")
  @Roles(...TICKET_MANAGER_ROLES_PRISMA)
  @UseInterceptors(FileInterceptor("file"))
  uploadAttachment(@UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer }, @CurrentUser() user: AuthUser) {
    return this.ticketsService.uploadAttachment(file, user);
  }

  @Post()
  @HttpCode(201)
  @Roles(...TICKET_MANAGER_ROLES_PRISMA)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.create(dto, user);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.ticketsService.get(id, user);
  }

  @Patch(":id")
  @Roles(...TICKET_MANAGER_ROLES_PRISMA)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateTicketDto) {
    return this.ticketsService.update(id, dto);
  }
}
