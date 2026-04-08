import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

const leaderboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.use(authMiddleware);
router.use(leaderboardLimiter);

// Global leaderboard
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const sort = (req.query.sort as string) || 'points';

  let orderBy: Record<string, 'asc' | 'desc'>;
  switch (sort) {
    case 'wins':
      orderBy = { gamesWon: 'desc' };
      break;
    case 'accuracy':
      orderBy = { correctPicks: 'desc' };
      break;
    case 'streak':
      orderBy = { currentStreak: 'desc' };
      break;
    case 'points':
    default:
      orderBy = { totalPoints: 'desc' };
      break;
  }

  const stats = await prisma.userStats.findMany({
    where: { gamesPlayed: { gt: 0 } },
    include: { user: { select: { id: true, username: true } } },
    orderBy,
  });

  const entries = stats.map((s, index) => ({
    rank: index + 1,
    userId: s.userId,
    username: s.user.username,
    gamesPlayed: s.gamesPlayed,
    gamesWon: s.gamesWon,
    winRate: s.gamesPlayed > 0 ? Math.round((s.gamesWon / s.gamesPlayed) * 100) : 0,
    accuracy: s.totalPicks > 0 ? Math.round((s.correctPicks / s.totalPicks) * 100) : 0,
    totalPoints: s.totalPoints,
    currentStreak: s.currentStreak,
  }));

  res.json(entries);
});

export default router;
