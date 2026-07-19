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
import { IncidentsQueryDto, UpdateIncidentDto } from "./incidents.dto";
import { IncidentsService } from "./incidents.service";

@ApiTags("Incidents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  list(@Query() query: IncidentsQueryDto) {
    return this.incidentsService.list(query, query);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.incidentsService.get(id);
  }

  @Patch(":id")
  @Roles(UserRole.helpdesk, UserRole.it_ops)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateIncidentDto) {
    return this.incidentsService.update(id, dto);
  }

  @Post(":id/close")
  @HttpCode(200)
  @Roles(UserRole.helpdesk, UserRole.it_ops)
  close(@Param("id", ParseUUIDPipe) id: string) {
    return this.incidentsService.close(id);
  }
}
