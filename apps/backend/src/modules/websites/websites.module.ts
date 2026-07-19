import { Module } from "@nestjs/common";
import { RolesGuard } from "../../common/roles.guard";
import { WebsitesController } from "./websites.controller";
import { WebsitesService } from "./websites.service";

@Module({
  controllers: [WebsitesController],
  providers: [WebsitesService, RolesGuard],
  exports: [WebsitesService],
})
export class WebsitesModule {}
