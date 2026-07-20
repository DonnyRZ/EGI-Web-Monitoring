import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { createRefreshToken, hashToken, verifyPassword } from "../../common/crypto";
import { toUserDto } from "../../common/mappers";
import { createLogger } from "@egi/logging";

@Injectable()
export class AuthService {
  private readonly logger = createLogger("backend");
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      this.logger.warn("auth_login_failed", undefined, {
        email_domain: email.split("@")[1] ?? "unknown",
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    const refreshToken = createRefreshToken();
    const refreshDays = 7;
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    this.logger.log("auth_login_success", undefined, {
      user_id: user.id,
      user_role: user.role,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
      user: toUserDto(user),
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const session = await this.prisma.userSession.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!session || !session.user.isActive) {
      this.logger.warn("auth_refresh_failed");
      throw new UnauthorizedException("Invalid refresh token");
    }

    const nextRefreshToken = createRefreshToken();
    // Rotate atomically. A replay racing this request can no longer issue a
    // second access token after the first request replaces the stored hash.
    const rotated = await this.prisma.userSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { refreshTokenHash: hashToken(nextRefreshToken) },
    });
    if (rotated.count !== 1) {
      this.logger.warn("auth_refresh_replay_rejected", undefined, {
        user_id: session.user.id,
      });
      throw new UnauthorizedException("Invalid refresh token");
    }

    const accessToken = await this.jwtService.signAsync({
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
    });

    return {
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      expires_in: 900,
      user: toUserDto(session.user),
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return;
    }

    await this.prisma.userSession.updateMany({
      where: {
        refreshTokenHash: hashToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    this.logger.log("auth_logout", undefined, { refresh_token_present: Boolean(refreshToken) });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return toUserDto(user);
  }
}
