import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Severity, TaskBusinessStatus } from "@egi/database";
import { PaginationQueryDto } from "../../common/pagination.dto";
import type { TaskMonitoringPeriod } from "@egi/shared-types";

export class TaskMonitoringQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  project_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  website_id?: string;

  @ApiPropertyOptional({ description: "Developer utama, collaborator, atau owner pekerjaan." })
  @IsOptional()
  @IsUUID()
  developer_id?: string;

  @ApiPropertyOptional({ enum: TaskBusinessStatus })
  @IsOptional()
  @IsEnum(TaskBusinessStatus)
  status?: TaskBusinessStatus;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  priority?: Severity;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  needs_action?: boolean;

  @ApiPropertyOptional({ description: "Cari judul, ringkasan, Project, atau Website." })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ description: "Batasi daftar ke Task Umum tanpa Project." })
  @IsOptional()
  @IsIn(["general"])
  scope?: "general";
}

export class TaskMonitoringOverviewQueryDto extends TaskMonitoringQueryDto {
  @ApiPropertyOptional({ enum: ["7d", "30d", "90d", "month"], default: "30d" })
  @IsOptional()
  @IsIn(["7d", "30d", "90d", "month"])
  period?: TaskMonitoringPeriod;
}

export class UpdateTaskMonitoringStatusDto {
  @ApiPropertyOptional({ enum: TaskBusinessStatus })
  @IsOptional()
  @IsEnum(TaskBusinessStatus)
  status?: TaskBusinessStatus | null;
}
