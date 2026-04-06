import { prisma } from '../db';
import { BONUS_ROUND_MULTIPLIER } from '@phish-squares/shared';
import { calculatePickScore } from '@phish-squares/shared';

/**
 * Recompute and upsert UserStats for a single user.
 * Called after every game scoring operation.
 */
export async function recomputeUserStats(userId: string): Promise<void> {
  // Get all scored games the user participated in
  const gamePlayers = await prisma.gamePlayer.findMany({
    where: {
      userId,
      game: { status: 'SCORED' },
    },
    include: {
      game: {
        include: {
          picks: true,
          players: true,
        },
      },
    },
    orderBy: { game: { showDate: 'asc' } },
  });

  let gamesPlayed = 0;
  let gamesWon = 0;
  let totalPicks = 0;
  let correctPicks = 0;
  let totalPoints = 0;
  let bonusPicks = 0;
  let bonusCorrect = 0;
  let bestGamePoints = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let lastPlayedAt: Date | null = null;

  // For streak tracking
  const streakValues: boolean[] = [];

  for (const gp of gamePlayers) {
    const game = gp.game;
    gamesPlayed++;
    lastPlayedAt = game.showDate;

    // Calculate this user's picks in this game
    const userPicks = game.picks.filter((p) => p.userId === userId);
    const userCorrect = userPicks.filter((p) => p.scored === true);
    const userBonusPicks = userPicks.filter((p) => p.isBonus);
    const userBonusCorrect = userBonusPicks.filter((p) => p.scored === true);

    totalPicks += userPicks.length;
    correctPicks += userCorrect.length;
    bonusPicks += userBonusPicks.length;
    bonusCorrect += userBonusCorrect.length;

    // Calculate game points for this user
    let gamePoints = 0;
    for (const pick of userPicks) {
      gamePoints += calculatePickScore(pick.isBonus, pick.scored === true, BONUS_ROUND_MULTIPLIER);
    }
    totalPoints += gamePoints;
    if (gamePoints > bestGamePoints) bestGamePoints = gamePoints;

    // Determine if user won this game
    const playerScores = new Map<string, number>();
    for (const player of game.players) {
      const playerPicks = game.picks.filter((p) => p.userId === player.userId);
      let pts = 0;
      for (const pick of playerPicks) {
        pts += calculatePickScore(pick.isBonus, pick.scored === true, BONUS_ROUND_MULTIPLIER);
      }
      playerScores.set(player.userId, pts);
    }
    const maxScore = Math.max(...playerScores.values());
    if (gamePoints === maxScore && maxScore > 0) gamesWon++;

    // Streak: did user have ≥1 correct pick?
    streakValues.push(userCorrect.length > 0);
  }

  // Calculate streaks
  if (streakValues.length > 0) {
    // Current streak = consecutive games from most recent where correctPicks > 0
    currentStreak = 0;
    for (let i = streakValues.length - 1; i >= 0; i--) {
      if (streakValues[i]) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Longest streak = max consecutive run ever
    longestStreak = 0;
    let tempStreak = 0;
    for (const val of streakValues) {
      if (val) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }
  }

  // Count runs participated and won
  const runPlayers = await prisma.runPlayer.findMany({
    where: { userId },
    include: {
      run: {
        include: {
          games: {
            where: { status: 'SCORED' },
            include: { picks: true, players: true },
          },
          players: true,
        },
      },
    },
  });

  const runsParticipated = runPlayers.length;
  let runsWon = 0;

  for (const rp of runPlayers) {
    const run = rp.run;
    // Only count completed runs
    if (run.status !== 'COMPLETED') continue;

    // Calculate cumulative scores for all run players
    const runScores = new Map<string, number>();
    for (const player of run.players) {
      let pts = 0;
      for (const game of run.games) {
        const playerPicks = game.picks.filter((p) => p.userId === player.userId);
        for (const pick of playerPicks) {
          pts += calculatePickScore(pick.isBonus, pick.scored === true, BONUS_ROUND_MULTIPLIER);
        }
      }
      runScores.set(player.userId, pts);
    }

    const maxRunScore = Math.max(...runScores.values());
    const userRunScore = runScores.get(userId) ?? 0;
    if (userRunScore === maxRunScore && maxRunScore > 0) runsWon++;
  }

  await prisma.userStats.upsert({
    where: { userId },
    update: {
      gamesPlayed,
      gamesWon,
      totalPicks,
      correctPicks,
      totalPoints,
      bonusPicks,
      bonusCorrect,
      bestGamePoints,
      currentStreak,
      longestStreak,
      runsParticipated,
      runsWon,
      lastPlayedAt,
    },
    create: {
      userId,
      gamesPlayed,
      gamesWon,
      totalPicks,
      correctPicks,
      totalPoints,
      bonusPicks,
      bonusCorrect,
      bestGamePoints,
      currentStreak,
      longestStreak,
      runsParticipated,
      runsWon,
      lastPlayedAt,
    },
  });
}

/**
 * Recompute stats for ALL users. Admin-only rebuild.
 */
export async function recomputeAllStats(): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) {
    await recomputeUserStats(user.id);
  }
  return users.length;
}
