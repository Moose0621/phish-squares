import { Router, Request, Response } from 'express';
import {
  createRunSchema,
  joinRunSchema,
  updateRunSchema,
  BONUS_ROUND_MULTIPLIER,
} from '@phish-squares/shared';
import { generateInviteCode, calculatePickScore } from '@phish-squares/shared';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limit all run routes to mitigate abuse and DoS
const runRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs for these routes
  standardHeaders: true,
  legacyHeaders: false,
});

// All run routes require authentication
router.use(authMiddleware);
router.use(runRateLimiter);

/**
 * Helper: generate dates between startDate and endDate (inclusive).
 */
function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Helper: update Run status based on child game states.
 */
async function updateRunStatus(runId: string): Promise<void> {
  const games = await prisma.game.findMany({
    where: { runId },
    select: { status: true },
  });

  if (games.length === 0) return;

  const allScored = games.every((g) => g.status === 'SCORED');
  const anyActive = games.some((g) => g.status === 'DRAFTING' || g.status === 'LOCKED' || g.status === 'SCORED');

  let newStatus: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  if (allScored) {
    newStatus = 'COMPLETED';
  } else if (anyActive) {
    newStatus = 'ACTIVE';
  } else {
    newStatus = 'UPCOMING';
  }

  await prisma.run.update({
    where: { id: runId },
    data: { status: newStatus },
  });
}

// Create a new run
router.post('/', validate(createRunSchema), async (req: Request, res: Response): Promise<void> => {
  const { name, venue, startDate, endDate } = req.body;
  const userId = req.user!.userId;

  // Generate unique invite code for the run
  let inviteCode: string;
  let codeExists = true;
  do {
    inviteCode = generateInviteCode();
    const existingRun = await prisma.run.findUnique({ where: { inviteCode } });
    const existingGame = await prisma.game.findUnique({ where: { inviteCode } });
    codeExists = !!(existingRun || existingGame);
  } while (codeExists);

  const dates = getDateRange(startDate, endDate);

  // Create run + auto-create game stubs + add host as RunPlayer
  const run = await prisma.run.create({
    data: {
      name,
      venue,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      hostUserId: userId,
      inviteCode,
      players: {
        create: { userId },
      },
    },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
    },
  });

  // Create game stubs for each date in the range
  for (const date of dates) {
    let gameInviteCode: string;
    let gameCodeExists = true;
    do {
      gameInviteCode = generateInviteCode();
      const existingRun = await prisma.run.findUnique({ where: { inviteCode: gameInviteCode } });
      const existingGame = await prisma.game.findUnique({ where: { inviteCode: gameInviteCode } });
      gameCodeExists = !!(existingRun || existingGame);
    } while (gameCodeExists);

    await prisma.game.create({
      data: {
        hostUserId: userId,
        showDate: new Date(date),
        showVenue: venue,
        inviteCode: gameInviteCode,
        runId: run.id,
        players: {
          create: { userId, draftPosition: 0 },
        },
      },
    });
  }

  const runWithGames = await prisma.run.findUnique({
    where: { id: run.id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: {
        include: {
          players: { include: { user: { select: { id: true, username: true } } } },
        },
        orderBy: { showDate: 'asc' },
      },
    },
  });

  res.status(201).json(runWithGames);
});

// List runs the authenticated user participates in
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const runs = await prisma.run.findMany({
    where: {
      players: { some: { userId } },
    },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: { orderBy: { showDate: 'asc' } },
      host: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(runs);
});

// Get run details + child games + standings
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: {
        include: {
          players: { include: { user: { select: { id: true, username: true } } } },
          picks: true,
        },
        orderBy: { showDate: 'asc' },
      },
      host: { select: { id: true, username: true } },
    },
  });

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const isPlayer = run.players.some((p) => p.userId === userId);
  if (!isPlayer) {
    res.status(403).json({ error: 'You are not a participant in this run' });
    return;
  }

  res.json(run);
});

// Join a run via invite code
router.post('/join', validate(joinRunSchema), async (req: Request, res: Response): Promise<void> => {
  const { inviteCode } = req.body;
  const userId = req.user!.userId;

  const run = await prisma.run.findUnique({
    where: { inviteCode },
    include: {
      players: true,
      games: { include: { players: true } },
    },
  });

  if (!run) {
    res.status(404).json({ error: 'Run not found with that invite code' });
    return;
  }

  if (run.players.some((p) => p.userId === userId)) {
    res.status(400).json({ error: 'You are already in this run' });
    return;
  }

  // Add as RunPlayer
  await prisma.runPlayer.create({
    data: { runId: run.id, userId },
  });

  // Auto-add to all child games still in LOBBY status
  for (const game of run.games) {
    if (game.status === 'LOBBY') {
      const alreadyInGame = game.players.some((p) => p.userId === userId);
      if (!alreadyInGame && game.players.length < game.maxPlayers) {
        await prisma.gamePlayer.create({
          data: {
            gameId: game.id,
            userId,
            draftPosition: game.players.length,
          },
        });
      }
    }
  }

  const updatedRun = await prisma.run.findUnique({
    where: { id: run.id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: {
        include: {
          players: { include: { user: { select: { id: true, username: true } } } },
        },
        orderBy: { showDate: 'asc' },
      },
      host: { select: { id: true, username: true } },
    },
  });

  res.json(updatedRun);
});

// Update a run (host only, name/venue)
router.patch('/:id', validate(updateRunSchema), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const run = await prisma.run.findUnique({ where: { id } });
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (run.hostUserId !== userId) {
    res.status(403).json({ error: 'Only the host can edit this run' });
    return;
  }

  const { name, venue } = req.body;
  const data: Record<string, string> = {};
  if (name) data.name = name;
  if (venue) {
    data.venue = venue;
    // Also update venue on all LOBBY games in the run
    await prisma.game.updateMany({
      where: { runId: id, status: 'LOBBY' },
      data: { showVenue: venue },
    });
  }

  await prisma.run.update({ where: { id }, data });

  const updated = await prisma.run.findUnique({
    where: { id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: {
        include: { players: { include: { user: { select: { id: true, username: true } } } } },
        orderBy: { showDate: 'asc' },
      },
      host: { select: { id: true, username: true } },
    },
  });

  res.json(updated);
});

// Delete a game from a run (host only, game must be in LOBBY status)
router.delete('/:id/games/:gameId', async (req: Request, res: Response): Promise<void> => {
  const { id, gameId } = req.params;
  const userId = req.user!.userId;

  const run = await prisma.run.findUnique({
    where: { id },
    include: { games: true },
  });

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (run.hostUserId !== userId) {
    res.status(403).json({ error: 'Only the host can edit this run' });
    return;
  }

  const game = run.games.find((g) => g.id === gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found in this run' });
    return;
  }
  if (game.status !== 'LOBBY') {
    res.status(400).json({ error: 'Can only remove games that are still in LOBBY status' });
    return;
  }
  if (run.games.length <= 1) {
    res.status(400).json({ error: 'Cannot remove the last game from a run' });
    return;
  }

  // Cascade delete handles GamePlayer records
  await prisma.game.delete({ where: { id: gameId } });

  const updated = await prisma.run.findUnique({
    where: { id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: {
        include: { players: { include: { user: { select: { id: true, username: true } } } } },
        orderBy: { showDate: 'asc' },
      },
      host: { select: { id: true, username: true } },
    },
  });

  // Update run date range to match remaining games
  if (updated && updated.games.length > 0) {
    const sortedDates = updated.games.map((g) => g.showDate).sort((a, b) => a.getTime() - b.getTime());
    await prisma.run.update({
      where: { id },
      data: {
        startDate: sortedDates[0],
        endDate: sortedDates[sortedDates.length - 1],
      },
    });
  }

  res.json(updated);
});

// Add a game (new show date) to a run (host only)
router.post('/:id/games', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const { showDate } = req.body;

  if (!showDate || !/^\d{4}-\d{2}-\d{2}$/.test(showDate)) {
    res.status(400).json({ error: 'showDate is required in YYYY-MM-DD format' });
    return;
  }

  const run = await prisma.run.findUnique({
    where: { id },
    include: { players: true, games: true },
  });

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  if (run.hostUserId !== userId) {
    res.status(403).json({ error: 'Only the host can edit this run' });
    return;
  }

  // Check for duplicate date
  const dateStr = showDate;
  const existing = run.games.find(
    (g) => g.showDate.toISOString().split('T')[0] === dateStr
  );
  if (existing) {
    res.status(400).json({ error: 'A game already exists for that date' });
    return;
  }

  // Generate invite code for the new game
  let gameInviteCode: string;
  let codeExists = true;
  do {
    gameInviteCode = generateInviteCode();
    const existingRun = await prisma.run.findUnique({ where: { inviteCode: gameInviteCode } });
    const existingGame = await prisma.game.findUnique({ where: { inviteCode: gameInviteCode } });
    codeExists = !!(existingRun || existingGame);
  } while (codeExists);

  // Create the game and add all current run players
  await prisma.game.create({
    data: {
      hostUserId: userId,
      showDate: new Date(dateStr),
      showVenue: run.venue,
      inviteCode: gameInviteCode,
      runId: run.id,
      players: {
        create: run.players.map((rp, i) => ({
          userId: rp.userId,
          draftPosition: i,
        })),
      },
    },
  });

  // Update run date range
  const allDates = [...run.games.map((g) => g.showDate), new Date(dateStr)].sort(
    (a, b) => a.getTime() - b.getTime()
  );
  await prisma.run.update({
    where: { id },
    data: {
      startDate: allDates[0],
      endDate: allDates[allDates.length - 1],
    },
  });

  const updated = await prisma.run.findUnique({
    where: { id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: {
        include: { players: { include: { user: { select: { id: true, username: true } } } } },
        orderBy: { showDate: 'asc' },
      },
      host: { select: { id: true, username: true } },
    },
  });

  res.status(201).json(updated);
});

// Get cumulative standings for a run
router.get('/:id/standings', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      games: {
        where: { status: 'SCORED' },
        include: { picks: true },
        orderBy: { showDate: 'asc' },
      },
    },
  });

  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const isPlayer = run.players.some((p) => p.userId === userId);
  if (!isPlayer) {
    res.status(403).json({ error: 'You are not a participant in this run' });
    return;
  }

  // Build standings
  const standings = run.players.map((rp) => {
    const gameScores = run.games.map((game) => {
      const userPicks = game.picks.filter((p) => p.userId === rp.userId);
      let points = 0;
      for (const pick of userPicks) {
        points += calculatePickScore(pick.isBonus, pick.scored === true, BONUS_ROUND_MULTIPLIER);
      }
      return {
        gameId: game.id,
        showDate: game.showDate.toISOString().split('T')[0],
        points,
      };
    });

    const totalPoints = gameScores.reduce((sum, gs) => sum + gs.points, 0);

    return {
      userId: rp.userId,
      username: rp.user?.username ?? '',
      gameScores,
      totalPoints,
      rank: 0,
    };
  });

  // Sort by total points descending
  standings.sort((a, b) => b.totalPoints - a.totalPoints);

  // Assign ranks (handle ties)
  for (let i = 0; i < standings.length; i++) {
    if (i === 0 || standings[i].totalPoints < standings[i - 1].totalPoints) {
      standings[i].rank = i + 1;
    } else {
      standings[i].rank = standings[i - 1].rank;
    }
  }

  res.json({
    run: {
      id: run.id,
      name: run.name,
      venue: run.venue,
      startDate: run.startDate,
      endDate: run.endDate,
      hostUserId: run.hostUserId,
      inviteCode: run.inviteCode,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    },
    standings,
  });
});

export { updateRunStatus };
export default router;
