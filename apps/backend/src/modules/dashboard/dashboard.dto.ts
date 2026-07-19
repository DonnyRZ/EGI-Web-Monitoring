import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class WebsiteDetailQueryDto {
  @ApiPropertyOptional({ default: 48, minimum: 1, maximum: 288 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(288)
  history_limit?: number;
}
