/**
 * Simulate a complete game for testing purposes.
 *
 * Usage:
 *   npx tsx apps/api/scripts/simulate-game.ts [playerCount] [totalRounds]
 *
 * Defaults: 4 players, 11 rounds (10 regular + 1 bonus)
 *
 * This will:
 *   1. Pick random users from the database (or create test users)
 *   2. Create a game
 *   3. Have all players join
 *   4. Start the draft
 *   5. Each player auto-picks a random available song
 *   6. Complete the draft → game status = LOCKED
 *   7. Print the game ID and results URL
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PLAYER_COUNT = 4;
const DEFAULT_TOTAL_ROUNDS = 11;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateInviteCode(length = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRoundPickOrder(draftOrder: string[], round: number): string[] {
  return round % 2 === 1 ? [...draftOrder] : [...draftOrder].reverse();
}

async function main() {
  const playerCount = parseInt(process.argv[2] || '', 10) || DEFAULT_PLAYER_COUNT;
  const totalRounds = parseInt(process.argv[3] || '', 10) || DEFAULT_TOTAL_ROUNDS;

  console.log(`\n🎮 Simulating game: ${playerCount} players, ${totalRounds} rounds\n`);

  // 1. Get or create players — prefer using moose (admin) as host
  const moose = await prisma.user.findUnique({ where: { username: 'moose' } });
  let users = await prisma.user.findMany({ take: playerCount + 1 });
  if (moose) {
    // Put moose first, fill the rest with other users
    users = [moose, ...users.filter((u) => u.id !== moose.id)].slice(0, playerCount);
  } else {
    users = users.slice(0, playerCount);
  }
  if (users.length < playerCount) {
    const passwordHash = await bcrypt.hash('test1234', 12);
    for (let i = users.length; i < playerCount; i++) {
      const u = await prisma.user.create({
        data: { username: `TestPlayer${i + 1}`, passwordHash },
      });
      users.push(u);
    }
  }
  users = users.slice(0, playerCount);
  console.log('Players:', users.map((u) => u.username).join(', '));

  // 2. Get available songs
  const songs = await prisma.song.findMany({
    orderBy: { timesPlayed: 'desc' },
    take: playerCount * totalRounds + 50, // Extra margin
  });
  if (songs.length < playerCount * totalRounds) {
    console.error(`Not enough songs in database (need ${playerCount * totalRounds}, have ${songs.length})`);
    process.exit(1);
  }

  // 3. Create the game
  const hostUser = users[0];
  const showDate = new Date('2026-07-04');
  const game = await prisma.game.create({
    data: {
      hostUserId: hostUser.id,
      showDate,
      showVenue: 'Simulated Test Venue',
      inviteCode: generateInviteCode(),
      maxPlayers: playerCount,
      totalRounds,
      players: {
        create: users.map((u, i) => ({
          userId: u.id,
          draftPosition: i,
        })),
      },
    },
  });
  console.log(`Game created: ${game.id}`);
  console.log(`Invite code: ${game.inviteCode}`);

  // 4. Start the draft
  const draftOrder = shuffleArray(users.map((u) => u.id));
  await prisma.game.update({
    where: { id: game.id },
    data: {
      status: 'DRAFTING',
      draftOrder,
      currentRound: 1,
      currentPickIndex: 0,
    },
  });

  // Update draft positions
  for (let i = 0; i < draftOrder.length; i++) {
    await prisma.gamePlayer.updateMany({
      where: { gameId: game.id, userId: draftOrder[i] },
      data: { draftPosition: i },
    });
  }

  console.log('\nDraft order:', draftOrder.map((id) => users.find((u) => u.id === id)!.username).join(' → '));

  // 5. Simulate all picks
  const availableSongs = shuffleArray([...songs]);
  let songIndex = 0;
  let pickOrder = 0;

  for (let round = 1; round <= totalRounds; round++) {
    const roundOrder = getRoundPickOrder(draftOrder, round);
    const isBonus = round === totalRounds;

    for (const userId of roundOrder) {
      const song = availableSongs[songIndex++];
      const username = users.find((u) => u.id === userId)!.username;

      await prisma.pick.create({
        data: {
          gameId: game.id,
          userId,
          songName: song.name,
          round,
          pickOrder: pickOrder++,
          isBonus,
        },
      });

      console.log(`  R${round}: ${username} picks "${song.name}"${isBonus ? ' (BONUS)' : ''}`);
    }
  }

  // 6. Lock the game
  await prisma.game.update({
    where: { id: game.id },
    data: {
      status: 'LOCKED',
      currentRound: totalRounds,
      currentPickIndex: playerCount - 1,
    },
  });

  const totalPicks = playerCount * totalRounds;
  console.log(`\n✅ Draft complete! ${totalPicks} picks across ${totalRounds} rounds.`);
  console.log(`Game status: LOCKED`);
  console.log(`\nView results: http://localhost:5173/game/${game.id}/results`);
  console.log(`Game ID: ${game.id}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
