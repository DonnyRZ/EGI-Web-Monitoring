import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsOptional } from "class-validator";
import { MonitoringStatus } from "@egi/database";
import { PaginationQueryDto } from "../../common/pagination.dto";

export class MonitoringHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MonitoringStatus })
  @IsOptional()
  @IsEnum(MonitoringStatus)
  status?: MonitoringStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
