import { Router, Request, Response } from 'express';
import {
  createGameSchema,
  joinGameSchema,
  MIN_PLAYERS,
} from '@phish-squares/shared';
import { generateInviteCode, generateDraftOrder } from '@phish-squares/shared';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';

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

  // Allow admin to view any game
  const isPlayer = game.players.some((p) => p.userId === userId);
  if (!isPlayer && !req.user!.isAdmin) {
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
  if (!isPlayer && !req.user!.isAdmin) {
    res.status(403).json({ error: 'You are not a player in this game' });
    return;
  }

  if (game.status !== 'SCORED') {
    res.status(400).json({ error: 'Game has not been scored yet' });
    return;
  }

  res.json(game);
});

export default router;
