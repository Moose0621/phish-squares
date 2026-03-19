import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Search songs (with autocomplete)
// Optional: pass ?gameId=xxx to exclude songs already picked in that game
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const query = req.query.q as string;
  if (!query || query.length < 2) {
    res.json([]);
    return;
  }

  // If gameId provided, get picked song names to exclude
  let excludeNames: string[] = [];
  const gameId = req.query.gameId as string | undefined;
  if (gameId) {
    const picks = await prisma.pick.findMany({
      where: { gameId },
      select: { songName: true },
    });
    excludeNames = picks.map((p) => p.songName);
  }

  const songs = await prisma.song.findMany({
    where: {
      name: {
        contains: query,
        mode: 'insensitive',
      },
      ...(excludeNames.length > 0 && {
        NOT: { name: { in: excludeNames } },
      }),
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

// Write-in a custom song (with duplicate validation)
router.post('/custom', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Song name is required' });
    return;
  }

  const trimmed = name.trim();

  // Check for duplicate (case-insensitive)
  const existing = await prisma.song.findFirst({
    where: {
      name: { equals: trimmed, mode: 'insensitive' },
    },
  });

  if (existing) {
    res.status(409).json({
      error: `Song "${existing.name}" already exists`,
      existingSong: existing,
    });
    return;
  }

  const song = await prisma.song.create({
    data: {
      name: trimmed,
      artist: '',
      timesPlayed: 0,
      isCustom: true,
    },
  });

  res.status(201).json(song);
});

export default router;
