/**
 * Upsert deterministic RBAC test users (known passwords for smoke/e2e).
 * Run: node --import tsx scripts/rbac-seed-users.mts
 */
import { hashSync } from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const PASSWORD = "TestRbac123!";
const hash = hashSync(PASSWORD, 10);

const users = [
  {
    email: "rbac.superadmin@egi.test",
    name: "RBAC Superadmin",
    role: UserRole.superadmin,
  },
  {
    email: "rbac.developer@egi.test",
    name: "RBAC Developer",
    role: UserRole.developer,
  },
  {
    email: "rbac.enduser@egi.test",
    name: "RBAC End User",
    role: UserRole.end_user,
  },
] as const;

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash: hash,
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  const endUser = await prisma.user.findUniqueOrThrow({
    where: { email: "rbac.enduser@egi.test" },
  });

  // Ensure at least one owned website for end_user dashboard scoping.
  const site = await prisma.website.findFirst({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  if (site) {
    await prisma.website.update({
      where: { id: site.id },
      data: { ownerId: endUser.id },
    });
    console.log(JSON.stringify({ ok: true, ownedWebsiteId: site.id, password: PASSWORD }));
  } else {
    console.log(JSON.stringify({ ok: true, ownedWebsiteId: null, password: PASSWORD }));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
