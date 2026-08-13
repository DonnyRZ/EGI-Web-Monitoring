import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: ["active", "down"] })
  @IsOptional()
  @IsIn(["active", "down"])
  status?: "active" | "down";
}

export class WebsiteDetailQueryDto {
  @ApiPropertyOptional({ default: 48, minimum: 1, maximum: 288 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(288)
  history_limit?: number;
}
