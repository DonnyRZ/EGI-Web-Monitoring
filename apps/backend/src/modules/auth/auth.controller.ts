import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, RefreshTokenDto, LogoutDto } from "./auth.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CurrentUser, AuthUser } from "../../common/current-user.decorator";
import { readCookie, REFRESH_COOKIE_NAME } from "./auth-cookie";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    return this.withRefreshCookie(response, await this.authService.login(dto.email, dto.password));
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = dto.refresh_token ?? readCookie(request.headers.cookie, REFRESH_COOKIE_NAME);
    if (!token) throw new UnauthorizedException("Refresh token is required");
    return this.withRefreshCookie(response, await this.authService.refresh(token));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(204)
  async logout(@Body() dto: LogoutDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(dto.refresh_token ?? readCookie(request.headers.cookie, REFRESH_COOKIE_NAME));
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  private withRefreshCookie(response: Response, result: Awaited<ReturnType<AuthService["login"]>>) {
    response.cookie(REFRESH_COOKIE_NAME, result.refresh_token, {
      ...this.cookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    const { refresh_token: _refreshToken, ...safeResult } = result;
    return safeResult;
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: `/${process.env.API_PREFIX ?? "api"}/auth`,
    };
  }
}
