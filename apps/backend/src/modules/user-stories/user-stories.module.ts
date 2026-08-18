import { Module } from "@nestjs/common";
import { RolesGuard } from "../../common/roles.guard";
import { UserStoriesController } from "./user-stories.controller";
import { UserStoriesService } from "./user-stories.service";

@Module({
  controllers: [UserStoriesController],
  providers: [UserStoriesService, RolesGuard],
  exports: [UserStoriesService],
})
export class UserStoriesModule {}
