import { Module } from "@nestjs/common";
import { RolesGuard } from "../../common/roles.guard";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, RolesGuard],
  exports: [TicketsService],
})
export class TicketsModule {}
