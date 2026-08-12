import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "egi.egiholding@gmail.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Admin123!" })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: "Legacy fallback; browser clients use the HttpOnly refresh cookie." })
  @IsOptional()
  @IsString()
  refresh_token?: string;
}

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refresh_token?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: "user@egiresources.com" })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: "Token from the reset password email link" })
  @IsString()
  token!: string;

  @ApiProperty({ example: "NewPassword123" })
  @IsString()
  @MinLength(8)
  new_password!: string;
}
