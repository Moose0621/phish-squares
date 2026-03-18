import bcrypt from 'bcrypt';
import { prisma } from '../db';

const ADMIN_USERNAME = 'Moose';
const ADMIN_INITIAL_PASSWORD = 'BlazeOn420';
const SALT_ROUNDS = 12;

export async function ensureAdminExists(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { username: ADMIN_USERNAME },
  });

  if (existing) {
    if (!existing.isAdmin) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isAdmin: true },
      });
      console.log(`Admin user ${ADMIN_USERNAME} promoted to admin`);
    } else {
      console.log(`Admin user ${ADMIN_USERNAME} already exists`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, SALT_ROUNDS);
  await prisma.user.create({
    data: {
      username: ADMIN_USERNAME,
      passwordHash,
      isAdmin: true,
    },
  });

  console.log(`Admin user ${ADMIN_USERNAME} created`);
}
