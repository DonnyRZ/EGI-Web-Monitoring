import { hashSync } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, UserRole } from "@prisma/client";

/** Load monorepo root `.env` when seed runs via workspace (Prisma only auto-loads package-local env). */
function loadRootEnv() {
  const envPath = resolve(__dirname, "../../../.env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

/** bcrypt password hash (aligned with apps/backend crypto). */
export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_ROUNDS);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

function domainFromUrl(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

const ADMIN_EMAIL = "egi.egiholding@gmail.com";
const DEVELOPER_EMAIL = "donny@egiresources.com";
const GUEST_EMAIL = "guest@egiresources.com";
const LEGACY_ADMIN_EMAIL = "admin@egi.co.id";

const websites = [
  { name: "EGI Inovasi Nusantara", url: "https://egi-inovasi.com/" },
  { name: "EGI Gallium", url: "https://egi-gallium.com/" },
  { name: "EGI Tin Primary", url: "https://www.egi-tin.com/" },
  { name: "Agat-Netcentric", url: "https://agat-netcentric.com/" },
  { name: "EGI Optik", url: "https://egi-optik.com/" },
  { name: "EGI Tower Jakarta", url: "https://egi-tower.com/" },
  { name: "Humble 8", url: "https://humble8.com/" },
  { name: "Hadith Hotel", url: "https://hadith-hotel.com/" },
  { name: "Hotel Kampoeng Indonesia", url: "https://hotel-kampoengindonesia.com/" },
  { name: "Graha Nusantara Villa", url: "https://grahanusantara-samarkand.com/" },
  { name: "7Oz Café", url: "https://7oz-espresso.com/" },
  { name: "Mecca Hotel", url: "https://www.mecca-hotel.com/" },
  { name: "EGI Media", url: "https://egi-media.com/" },
] as const;

/**
 * Seed is invoked on every backend container start (see
 * `prisma:migrate && prisma:seed && start:prod` in docker-compose), not just
 * the very first boot. That means anything placed in an upsert's `update`
 * branch runs on *every single restart/redeploy*, forever.
 *
 * Credentials must therefore only ever be set in the `create` branch (i.e.
 * the account did not exist yet - true first-time bootstrap). Once an
 * account exists, its password is owned exclusively by the application's
 * own auth flows (login, change-password, forgot/reset-password). Seed must
 * never fight those flows, or any user-initiated password change silently
 * reverts on the next deploy.
 *
 * `isActive`/`role`/`name` ARE still forced on every re-seed, by design: this
 * is an intentional safety-net so the two bootstrap accounts can never be
 * accidentally locked out or demoted.
 */
export function buildAdminUpsertData(env: NodeJS.ProcessEnv) {
  const email = env.SEED_ADMIN_EMAIL ?? ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD ?? "Admin123!";
  return {
    email,
    create: {
      name: "EGI Admin",
      email,
      passwordHash: hashPassword(password),
      role: UserRole.superadmin,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    update: {
      isActive: true,
      role: UserRole.superadmin,
    },
  };
}

export function buildGuestUpsertData(env: NodeJS.ProcessEnv) {
  const email = env.GUEST_EMAIL ?? env.SEED_GUEST_EMAIL ?? GUEST_EMAIL;
  return {
    email,
    create: {
      name: "Guest",
      email,
      passwordHash: hashPassword(randomBytes(32).toString("hex")),
      role: UserRole.end_user,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    update: {
      isActive: true,
      role: UserRole.end_user,
      name: "Guest",
    },
  };
}

export function buildDeveloperUpsertData(env: NodeJS.ProcessEnv) {
  const email = env.SEED_DEVELOPER_EMAIL ?? DEVELOPER_EMAIL;
  const password =
    env.SEED_DEVELOPER_PASSWORD ?? env.SEED_ADMIN_PASSWORD ?? "Admin123!";
  return {
    email,
    create: {
      name: "Donny",
      email,
      passwordHash: hashPassword(password),
      role: UserRole.developer,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
    update: {
      isActive: true,
      role: UserRole.developer,
      name: "Donny",
    },
  };
}

async function main() {
  const adminUpsertData = buildAdminUpsertData(process.env);
  const developerUpsertData = buildDeveloperUpsertData(process.env);
  const guestUpsertData = buildGuestUpsertData(process.env);

  // Migrate the legacy dummy admin to the real address without creating a
  // duplicate: rename it in place (keeping its existing password) when the
  // target email is not already taken.
  const legacyAdmin = await prisma.user.findUnique({
    where: { email: LEGACY_ADMIN_EMAIL },
  });
  const targetAdmin = await prisma.user.findUnique({
    where: { email: adminUpsertData.email },
  });
  const legacyRenamed =
    Boolean(legacyAdmin) && !targetAdmin && legacyAdmin!.email !== adminUpsertData.email;
  if (legacyRenamed) {
    await prisma.user.update({
      where: { id: legacyAdmin!.id },
      data: { email: adminUpsertData.email },
    });
  }

  // Account "existed" if it was found under its target email already, or was
  // just renamed in place from the legacy address above.
  const adminExisted = Boolean(targetAdmin) || legacyRenamed;
  const admin = await prisma.user.upsert({
    where: { email: adminUpsertData.email },
    update: adminUpsertData.update,
    create: adminUpsertData.create,
  });

  const developerExisted = Boolean(
    await prisma.user.findUnique({ where: { email: developerUpsertData.email } }),
  );
  const developer = await prisma.user.upsert({
    where: { email: developerUpsertData.email },
    update: developerUpsertData.update,
    create: developerUpsertData.create,
  });

  const guestExisted = Boolean(
    await prisma.user.findUnique({ where: { email: guestUpsertData.email } }),
  );
  const guest = await prisma.user.upsert({
    where: { email: guestUpsertData.email },
    update: guestUpsertData.update,
    create: guestUpsertData.create,
  });

  for (const site of websites) {
    const existing = await prisma.website.findFirst({
      where: { url: site.url },
    });

    if (existing) {
      continue;
    }

    await prisma.website.create({
      data: {
        name: site.name,
        domain: domainFromUrl(site.url),
        url: site.url,
        ownerId: admin.id,
        monitoringIntervalMinutes: 5,
        isActive: true,
      },
    });
  }

  console.log(
    `Admin: ${admin.email} (${adminExisted ? "existing, password untouched" : "created"})`,
  );
  console.log(
    `Developer: ${developer.email} (${developerExisted ? "existing, password untouched" : "created"})`,
  );
  console.log(
    `Guest: ${guest.email} (${guestExisted ? "existing, password untouched" : "created"})`,
  );
  console.log(`Websites checked: ${websites.length}`);
}

// Guard so this module can be imported (e.g. by seed.test.ts) for its pure
// helper functions without triggering a real DB seed run as a side effect.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
