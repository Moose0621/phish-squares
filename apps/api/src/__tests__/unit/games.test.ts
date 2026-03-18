import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import gamesRouter from '../../routes/games';
import { prisma } from '../../db';

// Mock Prisma
jest.mock('../../db', () => ({
  prisma: {
    game: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    gamePlayer: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    pick: {
      update: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    jwtSecret: 'test-secret',
    jwtExpiresIn: '7d',
  },
}));

// Mock scoring service
jest.mock('../../services/scoring', () => ({
  scoreGame: jest.fn(),
}));

// Mock phishnet service
jest.mock('../../services/phishnet', () => ({
  fetchSetlistByDate: jest.fn(),
}));

import { scoreGame } from '../../services/scoring';
import { fetchSetlistByDate } from '../../services/phishnet';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockScoreGame = scoreGame as jest.MockedFunction<typeof scoreGame>;
const mockFetchSetlistByDate = fetchSetlistByDate as jest.MockedFunction<typeof fetchSetlistByDate>;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/games', gamesRouter);
  return app;
}

function makeToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, 'test-secret', { expiresIn: '1h' });
}

describe('POST /api/games', () => {
  const token = makeToken('user-1', 'host');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a new game', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(null); // invite code unique check
    (mockPrisma.game.create as jest.Mock).mockResolvedValue({
      id: 'game-1',
      hostUserId: 'user-1',
      showDate: new Date('2025-08-15'),
      showVenue: 'MSG',
      status: 'LOBBY',
      inviteCode: 'ABC123',
      players: [{ userId: 'user-1', user: { id: 'user-1', username: 'host' } }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${token}`)
      .send({ showDate: '2025-08-15', showVenue: 'MSG' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'game-1');
    expect(res.body).toHaveProperty('inviteCode');
  });

  it('should return 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/games')
      .send({ showDate: '2025-08-15', showVenue: 'MSG' });

    expect(res.status).toBe(401);
  });

  it('should return 400 for invalid date format', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${token}`)
      .send({ showDate: 'not-a-date', showVenue: 'MSG' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/games', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list user games', async () => {
    (mockPrisma.game.findMany as jest.Mock).mockResolvedValue([
      { id: 'game-1', showVenue: 'MSG', status: 'LOBBY' },
      { id: 'game-2', showVenue: 'Dicks', status: 'SCORED' },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/games')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /api/games/:id', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return game details for a player', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      showVenue: 'MSG',
      players: [{ userId: 'user-1' }],
      picks: [],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/games/game-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('game-1');
  });

  it('should return 404 for non-existent game', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/games/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should return 403 for non-player', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      players: [{ userId: 'other-user' }],
      picks: [],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/games/game-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/games/join', () => {
  const token = makeToken('user-2', 'player2');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should join a game via invite code', async () => {
    (mockPrisma.game.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'game-1',
        status: 'LOBBY',
        maxPlayers: 8,
        players: [{ userId: 'user-1' }],
      })
      .mockResolvedValueOnce({
        id: 'game-1',
        players: [
          { userId: 'user-1', user: { id: 'user-1', username: 'host' } },
          { userId: 'user-2', user: { id: 'user-2', username: 'player2' } },
        ],
      });
    (mockPrisma.gamePlayer.create as jest.Mock).mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/games/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });

    expect(res.status).toBe(200);
    expect(mockPrisma.gamePlayer.create).toHaveBeenCalled();
  });

  it('should return 404 for invalid invite code', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/games/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'XXXXXX' });

    expect(res.status).toBe(404);
  });

  it('should return 400 if already in game', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOBBY',
      maxPlayers: 8,
      players: [{ userId: 'user-2' }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You are already in this game');
  });

  it('should return 400 if game is full', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOBBY',
      maxPlayers: 2,
      players: [{ userId: 'user-1' }, { userId: 'user-3' }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Game is full');
  });

  it('should return 400 if game is not in LOBBY', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'DRAFTING',
      maxPlayers: 8,
      players: [{ userId: 'user-1' }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Game is no longer accepting players');
  });
});

describe('POST /api/games/:id/start', () => {
  const token = makeToken('user-1', 'host');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should start the draft for host', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      hostUserId: 'user-1',
      status: 'LOBBY',
      players: [{ userId: 'user-1' }, { userId: 'user-2' }],
    });
    (mockPrisma.game.update as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'DRAFTING',
      draftOrder: ['user-1', 'user-2'],
      players: [],
    });
    (mockPrisma.gamePlayer.updateMany as jest.Mock).mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/games/game-1/start')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.game.update).toHaveBeenCalled();
  });

  it('should return 403 for non-host', async () => {
    const otherToken = makeToken('user-2', 'nothost');
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      hostUserId: 'user-1',
      status: 'LOBBY',
      players: [{ userId: 'user-1' }, { userId: 'user-2' }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games/game-1/start')
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('should return 400 if not enough players', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      hostUserId: 'user-1',
      status: 'LOBBY',
      players: [{ userId: 'user-1' }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games/game-1/start')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/games/:id/score', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should score a locked game', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOCKED',
      players: [{ userId: 'user-1' }],
    });
    mockScoreGame.mockResolvedValue(undefined);

    const app = createApp();
    const res = await request(app)
      .post('/api/games/game-1/score')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Game scored successfully');
    expect(mockScoreGame).toHaveBeenCalledWith('game-1');
  });

  it('should return 400 if game is not LOCKED', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'DRAFTING',
      players: [{ userId: 'user-1' }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games/game-1/score')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('should return 403 if not a player', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOCKED',
      players: [{ userId: 'other-user' }],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/games/game-1/score')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('should return 422 if no setlist found', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOCKED',
      players: [{ userId: 'user-1' }],
    });
    mockScoreGame.mockRejectedValue(new Error('No setlist found'));

    const app = createApp();
    const res = await request(app)
      .post('/api/games/game-1/score')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('No setlist found for this show date');
  });
});

describe('GET /api/games/:id/results', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return aggregated results for a scored game', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'SCORED',
      showDate: new Date('2025-08-15'),
      showVenue: 'MSG',
      players: [
        { userId: 'user-1', user: { id: 'user-1', username: 'player1' } },
        { userId: 'user-2', user: { id: 'user-2', username: 'player2' } },
      ],
      picks: [
        { id: 'p1', gameId: 'game-1', userId: 'user-1', songName: 'Tweezer', round: 1, pickOrder: 0, isBonus: false, scored: true, createdAt: new Date() },
        { id: 'p2', gameId: 'game-1', userId: 'user-2', songName: 'Wrong Song', round: 1, pickOrder: 1, isBonus: false, scored: false, createdAt: new Date() },
        { id: 'p3', gameId: 'game-1', userId: 'user-2', songName: 'Stash', round: 2, pickOrder: 0, isBonus: true, scored: true, createdAt: new Date() },
      ],
    });
    // Return the real setlist from Phish.net (includes songs nobody picked)
    mockFetchSetlistByDate.mockResolvedValue(['Tweezer', 'Stash', 'Fluffhead', 'YEM']);

    const app = createApp();
    const res = await request(app)
      .get('/api/games/game-1/results')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.gameId).toBe('game-1');
    expect(res.body.showDate).toBe('2025-08-15');
    expect(res.body.showVenue).toBe('MSG');
    // Setlist should be the real setlist from Phish.net, not just correct picks
    expect(res.body.setlist).toEqual(['Tweezer', 'Stash', 'Fluffhead', 'YEM']);
    expect(mockFetchSetlistByDate).toHaveBeenCalledWith('2025-08-15');
    expect(res.body.playerResults).toHaveLength(2);

    // Player 2 (Stash bonus=2 + correct picks) should rank higher
    const p2Result = res.body.playerResults.find((p: { userId: string }) => p.userId === 'user-2');
    expect(p2Result.totalPoints).toBe(2); // bonus pick = 2 points
    expect(p2Result.rank).toBe(1);

    const p1Result = res.body.playerResults.find((p: { userId: string }) => p.userId === 'user-1');
    expect(p1Result.totalPoints).toBe(1);
    expect(p1Result.rank).toBe(2);
  });

  it('should handle tied scores with same rank', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'SCORED',
      showDate: new Date('2025-08-15'),
      showVenue: 'MSG',
      players: [
        { userId: 'user-1', user: { id: 'user-1', username: 'player1' } },
        { userId: 'user-2', user: { id: 'user-2', username: 'player2' } },
      ],
      picks: [
        { id: 'p1', gameId: 'game-1', userId: 'user-1', songName: 'Tweezer', round: 1, pickOrder: 0, isBonus: false, scored: true, createdAt: new Date() },
        { id: 'p2', gameId: 'game-1', userId: 'user-2', songName: 'Stash', round: 1, pickOrder: 1, isBonus: false, scored: true, createdAt: new Date() },
      ],
    });
    mockFetchSetlistByDate.mockResolvedValue(['Tweezer', 'Stash']);

    const app = createApp();
    const res = await request(app)
      .get('/api/games/game-1/results')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.playerResults[0].rank).toBe(1);
    expect(res.body.playerResults[1].rank).toBe(1); // Same rank for tie
  });

  it('should fall back to correct-picks setlist if Phish.net fetch fails', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'SCORED',
      showDate: new Date('2025-08-15'),
      showVenue: 'MSG',
      players: [
        { userId: 'user-1', user: { id: 'user-1', username: 'player1' } },
      ],
      picks: [
        { id: 'p1', gameId: 'game-1', userId: 'user-1', songName: 'Tweezer', round: 1, pickOrder: 0, isBonus: false, scored: true, createdAt: new Date() },
        { id: 'p2', gameId: 'game-1', userId: 'user-1', songName: 'Wrong Song', round: 2, pickOrder: 0, isBonus: false, scored: false, createdAt: new Date() },
      ],
    });
    mockFetchSetlistByDate.mockRejectedValue(new Error('Phish.net API error: 503 Service Unavailable'));

    const app = createApp();
    const res = await request(app)
      .get('/api/games/game-1/results')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Falls back to correct picks only
    expect(res.body.setlist).toEqual(['Tweezer']);
  });

  it('should return 400 if game is not scored', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOCKED',
      players: [{ userId: 'user-1' }],
      picks: [],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/games/game-1/results')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('should return 404 if game not found', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/games/nonexistent/results')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should return 403 if not a player', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'SCORED',
      players: [{ userId: 'other-user' }],
      picks: [],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/games/game-1/results')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
