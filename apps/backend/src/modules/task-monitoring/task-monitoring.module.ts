import { Module } from "@nestjs/common";
import { TaskMonitoringController } from "./task-monitoring.controller";
import { TaskMonitoringService } from "./task-monitoring.service";

@Module({
  controllers: [TaskMonitoringController],
  providers: [TaskMonitoringService],
  exports: [TaskMonitoringService],
})
export class TaskMonitoringModule {}
