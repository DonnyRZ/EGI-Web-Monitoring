import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { TaskStatus } from "@egi/database";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class CreateTaskDto {
  @ApiProperty()
  @IsUUID()
  website_id!: string;

  @ApiPropertyOptional({
    description:
      "Developer user id to assign. Required for superadmin delegation; ignored (forced to self) for developers creating their own to-do.",
  })
  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  instruction_notes!: string;

  @ApiPropertyOptional({ description: "Object storage path / URL" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachment_url?: string;

  @ApiPropertyOptional({ example: "2026-08-10T17:00:00.000Z" })
  @IsOptional()
  @IsDateString()
  sla_deadline?: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus, example: TaskStatus.in_progress })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

export class TasksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  website_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignee_id?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
