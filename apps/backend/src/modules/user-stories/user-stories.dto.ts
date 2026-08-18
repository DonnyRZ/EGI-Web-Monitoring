import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { UserStoryPriority, UserStoryStatus } from "@egi/database";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class CreateUserStoryDto {
  @ApiProperty({ example: "Perbaiki form login mobile" })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acceptance_criteria?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  website_id?: string | null;

  @ApiPropertyOptional({ enum: UserStoryPriority, default: UserStoryPriority.medium })
  @IsOptional()
  @IsEnum(UserStoryPriority)
  priority?: UserStoryPriority;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  primary_developer_id?: string | null;

  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  collaborator_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  due_date?: string | null;
}

export class UpdateUserStoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acceptance_criteria?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  website_id?: string | null;

  @ApiPropertyOptional({ enum: UserStoryPriority })
  @IsOptional()
  @IsEnum(UserStoryPriority)
  priority?: UserStoryPriority;

  @ApiPropertyOptional({ enum: UserStoryStatus })
  @IsOptional()
  @IsEnum(UserStoryStatus)
  status?: UserStoryStatus;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  @IsOptional()
  @IsUUID("4")
  primary_developer_id?: string | null;

  @ApiPropertyOptional({ type: [String], format: "uuid" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  collaborator_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  due_date?: string | null;
}

export class UserStoriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  project_id?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  website_id?: string;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID("4")
  developer_id?: string;

  @ApiPropertyOptional({ enum: UserStoryStatus })
  @IsOptional()
  @IsEnum(UserStoryStatus)
  status?: UserStoryStatus;

  @ApiPropertyOptional({ enum: UserStoryPriority })
  @IsOptional()
  @IsEnum(UserStoryPriority)
  priority?: UserStoryPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  overdue?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  has_ticket?: boolean;
}
