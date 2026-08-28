import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { Severity, TicketCategory } from "@egi/database";

/**
 * Business-facing work intake. It is stored as a Ticket internally so the
 * existing incident, Project, and User Story relationships remain intact.
 * Developer assignment is deliberately absent from this contract.
 */
export class CreateTaskIntakeDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  project_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  website_id?: string;

  @ApiProperty({ enum: TicketCategory })
  @IsEnum(TicketCategory)
  category!: TicketCategory;

  @ApiPropertyOptional({ description: "Nama website yang diusulkan untuk kategori Website baru." })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  requested_website_name?: string;

  @ApiPropertyOptional({ description: "Domain website jika sudah tersedia." })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  requested_domain?: string;

  @ApiPropertyOptional({ description: "Nama Project yang diusulkan jika Project belum dibuat." })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  requested_project_name?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10000)
  description!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(10000)
  expectation!: string;

  @ApiPropertyOptional({ enum: Severity, default: Severity.medium })
  @IsOptional()
  @IsEnum(Severity)
  priority?: Severity;

  @ApiPropertyOptional({ description: "Existing object-storage path / URL" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachment_url?: string;
}
