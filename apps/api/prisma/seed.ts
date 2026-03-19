import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const USERS = [
  { username: 'moose', isAdmin: true },
  { username: 'Fluff' },
  { username: 'Balloon Boon' },
  { username: 'Taper potty' },
  { username: 'Brent' },
  { username: 'Biske' },
  { username: '#1' },
  { username: 'Beav' },
  { username: 'Brandon Wabble' },
  { username: 'Turkey' },
  { username: "Why's the carpet all wet Toddington" },
  { username: 'Kip' },
  { username: 'CT Bob Vila' },
  { username: 'Uncle Don' },
];

async function main() {
  // Default password for all users — admin can reset later
  const defaultHash = await bcrypt.hash('phish2026', 12);
  const mooseHash = await bcrypt.hash('moose', 12);

  for (const { username, isAdmin } of USERS) {
    const hash = username === 'moose' ? mooseHash : defaultHash;
    const user = await prisma.user.upsert({
      where: { username },
      update: { isAdmin: isAdmin ?? false },
      create: {
        username,
        passwordHash: hash,
        isAdmin: isAdmin ?? false,
      },
    });
    console.log(`Seeded user: ${user.username} (id: ${user.id})${isAdmin ? ' [ADMIN]' : ''}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
