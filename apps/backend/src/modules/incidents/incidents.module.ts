import { Module } from "@nestjs/common";
import { RolesGuard } from "../../common/roles.guard";
import { IncidentsController } from "./incidents.controller";
import { IncidentsService } from "./incidents.service";

@Module({
  controllers: [IncidentsController],
  providers: [IncidentsService, RolesGuard],
  exports: [IncidentsService],
})
export class IncidentsModule {}
