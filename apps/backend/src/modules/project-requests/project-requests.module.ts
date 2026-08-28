import { Module } from "@nestjs/common";
import { RolesGuard } from "../../common/roles.guard";
import { ProjectRequestsController } from "./project-requests.controller";
import { ProjectRequestsService } from "./project-requests.service";

@Module({
  controllers: [ProjectRequestsController],
  providers: [ProjectRequestsService, RolesGuard],
  exports: [ProjectRequestsService],
})
export class ProjectRequestsModule {}
