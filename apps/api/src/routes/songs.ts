import { Router, Request, Response } from 'express';
import { prisma } from '../db';

const router = Router();

// Search songs (with autocomplete)
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const query = req.query.q as string;
  if (!query || query.length < 2) {
    res.json([]);
    return;
  }

  const songs = await prisma.song.findMany({
    where: {
      name: {
        contains: query,
        mode: 'insensitive',
      },
    },
    orderBy: { timesPlayed: 'desc' },
    take: 20,
  });

  res.json(songs);
});

// Get all songs
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const songs = await prisma.song.findMany({
    orderBy: { name: 'asc' },
  });

  res.json(songs);
});

export default router;
