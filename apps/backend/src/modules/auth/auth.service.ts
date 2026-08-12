import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { NotificationChannel, NotificationStatus } from "@egi/database";
import { PrismaService } from "../../prisma/prisma.service";
import { createRefreshToken, hashPassword, hashToken, verifyPassword } from "../../common/crypto";
import { toUserDto } from "../../common/mappers";
import { createLogger } from "@egi/logging";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RESET_RATE_LIMIT_MAX_REQUESTS = 3;
const GENERIC_FORGOT_PASSWORD_MESSAGE =
  "Jika email terdaftar, kami mengirimkan link reset password ke email tersebut.";

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

  /**
   * Always resolves with a generic message (no user enumeration) regardless of
   * whether the email exists, is active, or is currently rate-limited.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
    }

    const recentRequests = await this.prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gt: new Date(Date.now() - RESET_RATE_LIMIT_WINDOW_MS) },
      },
    });
    if (recentRequests >= RESET_RATE_LIMIT_MAX_REQUESTS) {
      this.logger.warn("auth_forgot_password_rate_limited", undefined, { user_id: user.id });
      return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
    }

    const token = createRefreshToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const appUrl = process.env.PUBLIC_APP_URL?.trim();
    const resetPath = `/reset-password?token=${token}`;
    const link = appUrl ? `${appUrl.replace(/\/+$/, "")}${resetPath}` : resetPath;
    await this.prisma.notification.create({
      data: {
        userId: user.id,
        channel: NotificationChannel.email,
        title: "Reset password EGI Monitoring",
        message: [
          `Halo ${user.name},`,
          "",
          "Kami menerima permintaan reset password untuk akun ini. Klik link berikut untuk mengatur password baru (berlaku 30 menit):",
          link,
          "",
          "Jika Anda tidak meminta ini, abaikan email ini dan password Anda tidak akan berubah.",
        ].join("\n"),
        status: NotificationStatus.pending,
      },
    });

    this.logger.log("auth_forgot_password_requested", undefined, { user_id: user.id });
    return { message: GENERIC_FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash: hashToken(token),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!record) {
      this.logger.warn("auth_reset_password_invalid_token");
      throw new UnauthorizedException("Token reset password tidak valid atau sudah kedaluwarsa");
    }

    // Mark the token used first (guarded by usedAt: null) so a replay racing this
    // request can no longer redeem the same token twice.
    const claimed = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      this.logger.warn("auth_reset_password_replay_rejected", undefined, { user_id: record.userId });
      throw new UnauthorizedException("Token reset password tidak valid atau sudah kedaluwarsa");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: hashPassword(newPassword) },
      }),
      this.prisma.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log("auth_reset_password_success", undefined, { user_id: record.userId });
    return { message: "Password berhasil diubah. Silakan login kembali." };
  }
}
