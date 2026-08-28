import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ProjectRequestStatus } from "@egi/database";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class CreateProjectRequestDto {
  @ApiProperty({ maxLength: 150, example: "Portal HR EGI" })
  @IsString()
  @MaxLength(150)
  requested_name!: string;

  @ApiProperty({ maxLength: 10000, description: "Ringkasan kebutuhan atau briefing Project." })
  @IsString()
  @MaxLength(10000)
  briefing!: string;

  @ApiProperty({ maxLength: 10000, description: "Hasil yang diharapkan dari Project." })
  @IsString()
  @MaxLength(10000)
  expected_outcome!: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  proposed_website_name?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  proposed_domain?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachment_url?: string;
}

export class UpdateProjectRequestDto {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  requested_name?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  briefing?: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  expected_outcome?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  proposed_website_name?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  proposed_domain?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachment_url?: string;
}

export class ProjectRequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProjectRequestStatus })
  @IsOptional()
  @IsEnum(ProjectRequestStatus)
  status?: ProjectRequestStatus;

  @ApiPropertyOptional({ description: "Search request number, project name, or requester." })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ProjectRequestReviewNoteDto {
  @ApiProperty({ maxLength: 5000 })
  @IsString()
  @MaxLength(5000)
  note!: string;
}

export class ApproveProjectRequestDto {
  @ApiProperty({ maxLength: 150, description: "Nama Project final setelah ditinjau IT." })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ maxLength: 10000, description: "Deskripsi Project Draft final." })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  review_note?: string;
}
