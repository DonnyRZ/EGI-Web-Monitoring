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

/** DTOs for reading and updating historical direct-assignment tasks only. */
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
