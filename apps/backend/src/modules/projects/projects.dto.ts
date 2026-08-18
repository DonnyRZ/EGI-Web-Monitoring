import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ArrayUnique,
} from "class-validator";
import { ProjectStatus } from "@egi/database";
import { PaginationQueryDto } from "../../common/pagination.dto";

function booleanTransform(value: unknown) {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}

export class CreateProjectDto {
  @ApiProperty({ example: "Web IT" })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: "Project untuk layanan internal IT." })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ProjectStatus, default: ProjectStatus.draft })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}

export class ProjectsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Search project name, website name, or domain." })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => booleanTransform(value))
  @IsBoolean()
  missing_pic_web?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => booleanTransform(value))
  @IsBoolean()
  missing_pic_developer?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => booleanTransform(value))
  @IsBoolean()
  missing_developer_team?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => booleanTransform(value))
  @IsBoolean()
  has_active_tickets?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => booleanTransform(value))
  @IsBoolean()
  has_overdue_work?: boolean;
}

export class UpdateProjectAssignmentsDto {
  @ApiProperty({ type: [String], format: "uuid" })
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  pic_web_ids!: string[];

  @ApiPropertyOptional({ nullable: true, format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  pic_developer_id?: string | null;

  @ApiProperty({ type: [String], format: "uuid" })
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  developer_ids!: string[];
}

export class UpdateProjectWebsitesDto {
  @ApiProperty({ type: [String], format: "uuid" })
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  website_ids!: string[];
}

export class AddProjectWebsiteDto {
  @ApiPropertyOptional({ format: "uuid", description: "Attach an existing website." })
  @IsOptional()
  @IsUUID("4")
  website_id?: string;

  @ApiPropertyOptional({ example: "Portal IT" })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: "portal.example.test" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  domain?: string;

  @ApiPropertyOptional({ example: "https://portal.example.test" })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  monitoring_interval_minutes?: number;
}
