import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Get authenticated user's stats
router.get('/me/stats', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const stats = await prisma.userStats.findUnique({
    where: { userId },
  });

  if (!stats) {
    // Return default stats if none exist
    res.json({
      userId,
      gamesPlayed: 0,
      gamesWon: 0,
      totalPicks: 0,
      correctPicks: 0,
      totalPoints: 0,
      bonusPicks: 0,
      bonusCorrect: 0,
      bestGamePoints: 0,
      currentStreak: 0,
      longestStreak: 0,
      runsParticipated: 0,
      runsWon: 0,
      lastPlayedAt: null,
    });
    return;
  }

  res.json(stats);
});

// Get any user's public stats
router.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const stats = await prisma.userStats.findUnique({
    where: { userId: id },
  });

  if (!stats) {
    res.json({
      userId: id,
      gamesPlayed: 0,
      gamesWon: 0,
      totalPicks: 0,
      correctPicks: 0,
      totalPoints: 0,
      bonusPicks: 0,
      bonusCorrect: 0,
      bestGamePoints: 0,
      currentStreak: 0,
      longestStreak: 0,
      runsParticipated: 0,
      runsWon: 0,
      lastPlayedAt: null,
    });
    return;
  }

  res.json(stats);
});

export default router;
