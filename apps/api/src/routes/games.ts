import { Router, Request, Response } from 'express';
import {
  createGameSchema,
  joinGameSchema,
  MIN_PLAYERS,
  BONUS_ROUND_MULTIPLIER,
  GameResult,
  PlayerResult,
} from '@phish-squares/shared';
import { generateInviteCode, generateDraftOrder, calculatePickScore } from '@phish-squares/shared';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { scoreGame } from '../services/scoring';
import { fetchSetlistByDate } from '../services/phishnet';

const router = Router();

// All game routes require authentication
router.use(authMiddleware);

// Create a new game
router.post('/', validate(createGameSchema), async (req: Request, res: Response): Promise<void> => {
  const { showDate, showVenue, maxPlayers, totalRounds } = req.body;
  const userId = req.user!.userId;

  let inviteCode: string;
  let codeExists = true;
  do {
    inviteCode = generateInviteCode();
    const existing = await prisma.game.findUnique({ where: { inviteCode } });
    codeExists = !!existing;
  } while (codeExists);

  const game = await prisma.game.create({
    data: {
      hostUserId: userId,
      showDate: new Date(showDate),
      showVenue,
      inviteCode,
      maxPlayers,
      totalRounds,
      players: {
        create: {
          userId,
          draftPosition: 0,
        },
      },
    },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
    },
  });

  res.status(201).json(game);
});

// List user's games
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const games = await prisma.game.findMany({
    where: {
      players: { some: { userId } },
    },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      host: { select: { id: true, username: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(games);
});

// Get game details
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      picks: { orderBy: [{ round: 'asc' }, { pickOrder: 'asc' }] },
      host: { select: { id: true, username: true } },
    },
  });

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  // Check user is a player in this game
  const isPlayer = game.players.some((p) => p.userId === userId);
  if (!isPlayer) {
    res.status(403).json({ error: 'You are not a player in this game' });
    return;
  }

  res.json(game);
});

// Join a game via invite code
router.post('/join', validate(joinGameSchema), async (req: Request, res: Response): Promise<void> => {
  const { inviteCode } = req.body;
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { inviteCode },
    include: { players: true },
  });

  if (!game) {
    res.status(404).json({ error: 'Game not found with that invite code' });
    return;
  }

  if (game.status !== 'LOBBY') {
    res.status(400).json({ error: 'Game is no longer accepting players' });
    return;
  }

  if (game.players.some((p) => p.userId === userId)) {
    res.status(400).json({ error: 'You are already in this game' });
    return;
  }

  if (game.players.length >= game.maxPlayers) {
    res.status(400).json({ error: 'Game is full' });
    return;
  }

  await prisma.gamePlayer.create({
    data: {
      gameId: game.id,
      userId,
      draftPosition: game.players.length,
    },
  });

  const updatedGame = await prisma.game.findUnique({
    where: { id: game.id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      host: { select: { id: true, username: true } },
    },
  });

  res.json(updatedGame);
});

// Start the draft (host only)
router.post('/:id/start', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { id },
    include: { players: true },
  });

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  if (game.hostUserId !== userId) {
    res.status(403).json({ error: 'Only the host can start the draft' });
    return;
  }

  if (game.status !== 'LOBBY') {
    res.status(400).json({ error: 'Game has already started' });
    return;
  }

  if (game.players.length < MIN_PLAYERS) {
    res.status(400).json({ error: `Need at least ${MIN_PLAYERS} players to start` });
    return;
  }

  const playerIds = game.players.map((p) => p.userId);
  const draftOrder = generateDraftOrder(playerIds);

  const updatedGame = await prisma.game.update({
    where: { id },
    data: {
      status: 'DRAFTING',
      draftOrder,
      currentRound: 1,
      currentPickIndex: 0,
    },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
    },
  });

  // Update draft positions based on randomized order
  for (let i = 0; i < draftOrder.length; i++) {
    await prisma.gamePlayer.updateMany({
      where: { gameId: id, userId: draftOrder[i] },
      data: { draftPosition: i },
    });
  }

  res.json(updatedGame);
});

// Score a game (any player in the game when status is LOCKED)
router.post('/:id/score', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { id },
    include: { players: true },
  });

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const isPlayer = game.players.some((p) => p.userId === userId);
  if (!isPlayer) {
    res.status(403).json({ error: 'You are not a player in this game' });
    return;
  }

  if (game.status !== 'LOCKED') {
    res.status(400).json({ error: 'Game must be in LOCKED status to score' });
    return;
  }

  try {
    await scoreGame(id);
    res.json({ message: 'Game scored successfully' });
  } catch (error) {
    let status = 500;
    let clientMessage = 'Failed to score game';

    if (error instanceof Error) {
      const rawMessage = error.message || '';
      const lowerMessage = rawMessage.toLowerCase();

      // Known business error: no setlist available for this show date
      if (rawMessage.includes('No setlist found')) {
        status = 422;
        clientMessage = 'No setlist found for this show date';
      }
      // Known upstream error: rate limiting or similar from external service
      else if (lowerMessage.includes('rate limit')) {
        status = 502;
        clientMessage = 'Upstream service temporarily unavailable';
      }
      // Other known/expected business errors can be mapped here as needed
      else if (status !== 500) {
        clientMessage = rawMessage;
      }
    }

    if (status === 500) {
      // Preserve generic message for unexpected internal errors
      clientMessage = 'Failed to score game';
    }

    res.status(status).json({ error: clientMessage });
  }
});

// Get game results
router.get('/:id/results', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      picks: { orderBy: [{ round: 'asc' }, { pickOrder: 'asc' }] },
    },
  });

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const isPlayer = game.players.some((p) => p.userId === userId);
  if (!isPlayer) {
    res.status(403).json({ error: 'You are not a player in this game' });
    return;
  }

  if (game.status !== 'SCORED' && game.status !== 'LOCKED') {
    res.status(400).json({ error: 'Game has not finished drafting yet' });
    return;
  }

  // Build aggregated player results
  const playerScores = new Map<string, { picks: typeof game.picks; totalPoints: number }>();

  for (const player of game.players) {
    playerScores.set(player.userId, { picks: [], totalPoints: 0 });
  }

  for (const pick of game.picks) {
    const entry = playerScores.get(pick.userId);
    if (entry) {
      entry.picks.push(pick);
      if (pick.scored === true) {
        entry.totalPoints += calculatePickScore(pick.isBonus, true, BONUS_ROUND_MULTIPLIER);
      }
    }
  }

  // Build sorted player results
  const playerResults: PlayerResult[] = game.players
    .map((player) => {
      const scores = playerScores.get(player.userId)!;
      return {
        userId: player.userId,
        username: player.user?.username ?? '',
        // Convert nullable scored (null = unscored) to boolean for ScoredPick type
        picks: scores.picks.map((p) => ({ ...p, scored: p.scored ?? false })),
        totalPoints: scores.totalPoints,
        rank: 0, // will be filled in below
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Assign ranks (handle ties)
  for (let i = 0; i < playerResults.length; i++) {
    if (i === 0 || playerResults[i].totalPoints < playerResults[i - 1].totalPoints) {
      playerResults[i].rank = i + 1;
    } else {
      playerResults[i].rank = playerResults[i - 1].rank;
    }
  }

  const showDate = game.showDate.toISOString().split('T')[0];

  // Try to fetch the real setlist — fail gracefully if unavailable
  let setlist: string[] = [];
  try {
    setlist = await fetchSetlistByDate(showDate);
  } catch {
    // Setlist unavailable (no API key, show hasn't happened yet, etc.)
  }

  const result: GameResult = {
    gameId: game.id,
    showDate,
    showVenue: game.showVenue,
    setlist,
    playerResults,
  };

  res.json(result);
});

export default router;
