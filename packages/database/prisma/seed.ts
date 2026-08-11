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

async function main() {
  // Real password comes from SEED_ADMIN_PASSWORD (kept out of git). When set,
  // it is also enforced on re-seed; otherwise we fall back to a dev default and
  // never overwrite an existing password.
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";
  const enforcePassword = Boolean(process.env.SEED_ADMIN_PASSWORD);
  const passwordHash = hashPassword(adminPassword);

  const developerEmail = process.env.SEED_DEVELOPER_EMAIL ?? DEVELOPER_EMAIL;
  const developerPassword =
    process.env.SEED_DEVELOPER_PASSWORD ?? adminPassword;
  const developerHash = hashPassword(developerPassword);

  // Migrate the legacy dummy admin to the real address without creating a
  // duplicate: rename it in place (keeping its existing password) when the
  // target email is not already taken.
  const legacyAdmin = await prisma.user.findUnique({
    where: { email: LEGACY_ADMIN_EMAIL },
  });
  const targetAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });
  if (legacyAdmin && !targetAdmin && legacyAdmin.email !== adminEmail) {
    await prisma.user.update({
      where: { id: legacyAdmin.id },
      data: { email: adminEmail },
    });
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    // Only overwrite the password on re-seed when SEED_ADMIN_PASSWORD is set;
    // otherwise leave whatever password the account currently has.
    update: {
      isActive: true,
      role: UserRole.superadmin,
      ...(enforcePassword ? { passwordHash } : {}),
    },
    create: {
      name: "EGI Admin",
      email: adminEmail,
      passwordHash,
      role: UserRole.superadmin,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
  });

  const developer = await prisma.user.upsert({
    where: { email: developerEmail },
    update: {
      isActive: true,
      role: UserRole.developer,
      name: "Donny",
      ...(enforcePassword || process.env.SEED_DEVELOPER_PASSWORD
        ? { passwordHash: developerHash }
        : {}),
    },
    create: {
      name: "Donny",
      email: developerEmail,
      passwordHash: developerHash,
      role: UserRole.developer,
      emailVerifiedAt: new Date(),
      isActive: true,
    },
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
    `Seeded admin ${admin.email}, developer ${developer.email}, and ${websites.length} websites`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
