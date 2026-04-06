import { prisma } from '../db';
import { fetchSetlistByDate } from './phishnet';
import { recomputeUserStats } from './stats';
import { updateRunStatus } from '../routes/runs';

/**
 * Score a game by comparing picks to the actual setlist from Phish.net.
 * Updates all picks with scored status and transitions game to SCORED.
 * After scoring, recomputes stats for all players and updates run status if applicable.
 */
export async function scoreGame(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      picks: true,
      players: { include: { user: { select: { id: true, username: true } } } },
    },
  });

  if (!game) {
    throw new Error('Game not found');
  }

  if (game.status !== 'LOCKED') {
    throw new Error('Game must be in LOCKED status to score');
  }

  // Format date as YYYY-MM-DD for Phish.net API
  const showDate = game.showDate.toISOString().split('T')[0];
  const setlist = await fetchSetlistByDate(showDate);

  if (setlist.length === 0) {
    throw new Error('No setlist found for this show date');
  }

  // Determine which songs were in the setlist (normalized)
  const normalizedSetlist = new Set(setlist.map((s) => s.trim().toLowerCase()));

  // Update each pick's scored status
  for (const pick of game.picks) {
    const isCorrect = normalizedSetlist.has(pick.songName.trim().toLowerCase());
    await prisma.pick.update({
      where: { id: pick.id },
      data: { scored: isCorrect },
    });
  }

  // Update game status to SCORED
  await prisma.game.update({
    where: { id: gameId },
    data: { status: 'SCORED' },
  });

  // Recompute stats for all players in this game
  for (const player of game.players) {
    try {
      await recomputeUserStats(player.userId);
    } catch {
      // Stats recomputation failure should not break scoring
    }
  }

  // Update run status if this game belongs to a run
  if (game.runId) {
    try {
      await updateRunStatus(game.runId);
    } catch {
      // Run status update failure should not break scoring
    }
  }
}

/**
 * Check for games that can be scored (LOCKED status with a past show date).
 */
export async function findGamesToScore(): Promise<string[]> {
  const now = new Date();
  // Look for games that are LOCKED with a show date in the past (at least 4 hours ago for setlist availability)
  const cutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const games = await prisma.game.findMany({
    where: {
      status: 'LOCKED',
      showDate: { lt: cutoff },
    },
    select: { id: true },
  });

  return games.map((g) => g.id);
}
