import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { registerSchema } from '@phish-squares/shared';
import { prisma } from '../db';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { recomputeAllStats } from '../services/stats';

const router = Router();

router.use(authMiddleware, adminMiddleware);

const SALT_ROUNDS = 12;

// List all users
router.get('/users', async (_req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, isAdmin: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

// Create a new user
router.post('/users', validate(registerSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { username, passwordHash },
  });

  res.status(201).json({ id: user.id, username: user.username, isAdmin: user.isAdmin, createdAt: user.createdAt });
});

// Delete a user (cannot delete yourself)
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

// Reset a user's password
router.patch('/users/:id/password', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  res.json({ message: 'Password updated' });
});

// Recompute all user stats from scratch
router.post('/stats/recompute', async (_req: Request, res: Response): Promise<void> => {
  try {
    const count = await recomputeAllStats();
    res.json({ message: `Stats recomputed for ${count} users` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to recompute stats';
    res.status(500).json({ error: message });
  }
});

export default router;
