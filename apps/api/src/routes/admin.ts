import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware, requireAdmin } from '../middleware/auth';
import { scoreGame } from '../services/scoring';

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin);

// List all games
router.get('/games', async (_req: Request, res: Response): Promise<void> => {
  const games = await prisma.game.findMany({
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      host: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(games);
});

// Delete a game
router.delete('/games/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  await prisma.game.delete({ where: { id } });
  res.json({ message: 'Game deleted' });
});

// Manually score a game
router.post('/games/:id/score', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    await scoreGame(id);
    res.json({ message: 'Game scored successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to score game';
    res.status(400).json({ error: message });
  }
});

// List all users
router.get('/users', async (_req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      createdAt: true,
      _count: { select: { gamePlayers: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(users);
});

// Delete a user
router.delete('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (id === req.user!.userId) {
    res.status(400).json({ error: 'Cannot delete your own account' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await prisma.user.delete({ where: { id } });
  res.json({ message: 'User deleted' });
});

export default router;
