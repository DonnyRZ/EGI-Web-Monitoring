import { hashSync } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, UserRole } from "@prisma/client";

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
      role: UserRole.it_ops,
      ...(enforcePassword ? { passwordHash } : {}),
    },
    create: {
      name: "EGI Admin",
      email: adminEmail,
      passwordHash,
      role: UserRole.it_ops,
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

  console.log(`Seeded admin ${admin.email} and ${websites.length} websites`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
