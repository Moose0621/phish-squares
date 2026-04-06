import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import runsRouter from '../../routes/runs';
import { prisma } from '../../db';

// Mock Prisma
jest.mock('../../db', () => ({
  prisma: {
    run: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    runPlayer: {
      create: jest.fn(),
    },
    game: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    gamePlayer: {
      create: jest.fn(),
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/runs', runsRouter);
  return app;
}

function makeToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, 'test-secret', { expiresIn: '1h' });
}

describe('POST /api/runs', () => {
  const token = makeToken('user-1', 'host');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a new run with game stubs', async () => {
    // Mock invite code uniqueness checks (run + game)
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(null);

    const mockRun = {
      id: 'run-1',
      name: 'MSG NYE Run 2026',
      venue: 'MSG',
      startDate: new Date('2026-12-28'),
      endDate: new Date('2026-12-31'),
      hostUserId: 'user-1',
      inviteCode: 'RUN123',
      status: 'UPCOMING',
      players: [{ userId: 'user-1', user: { id: 'user-1', username: 'host' } }],
    };

    (mockPrisma.run.create as jest.Mock).mockResolvedValue(mockRun);
    (mockPrisma.game.create as jest.Mock).mockResolvedValue({});

    // Return the complete run with games after creation
    (mockPrisma.run.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // invite code check
      .mockResolvedValueOnce(null) // game 1 code check
      .mockResolvedValueOnce(null) // game 2 code check
      .mockResolvedValueOnce(null) // game 3 code check
      .mockResolvedValueOnce(null) // game 4 code check
      .mockResolvedValueOnce({
        ...mockRun,
        games: [
          { id: 'game-1', showDate: new Date('2026-12-28'), showVenue: 'MSG', status: 'LOBBY', players: [] },
          { id: 'game-2', showDate: new Date('2026-12-29'), showVenue: 'MSG', status: 'LOBBY', players: [] },
          { id: 'game-3', showDate: new Date('2026-12-30'), showVenue: 'MSG', status: 'LOBBY', players: [] },
          { id: 'game-4', showDate: new Date('2026-12-31'), showVenue: 'MSG', status: 'LOBBY', players: [] },
        ],
      });

    const app = createApp();
    const res = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'MSG NYE Run 2026',
        venue: 'MSG',
        startDate: '2026-12-28',
        endDate: '2026-12-31',
      });

    expect(res.status).toBe(201);
    expect(mockPrisma.run.create).toHaveBeenCalled();
    // Should create 4 game stubs (Dec 28-31)
    expect(mockPrisma.game.create).toHaveBeenCalledTimes(4);
  });

  it('should return 400 if endDate is before startDate', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Bad Run',
        venue: 'MSG',
        startDate: '2026-12-31',
        endDate: '2026-12-28',
      });

    expect(res.status).toBe(400);
  });

  it('should return 400 for missing name', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/runs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        venue: 'MSG',
        startDate: '2026-12-28',
        endDate: '2026-12-31',
      });

    expect(res.status).toBe(400);
  });

  it('should return 401 without auth', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/runs')
      .send({
        name: 'MSG Run',
        venue: 'MSG',
        startDate: '2026-12-28',
        endDate: '2026-12-31',
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/runs', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should list runs for the authenticated user', async () => {
    (mockPrisma.run.findMany as jest.Mock).mockResolvedValue([
      { id: 'run-1', name: 'MSG Run', status: 'UPCOMING' },
      { id: 'run-2', name: 'Dicks Run', status: 'COMPLETED' },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/runs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /api/runs/:id', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return run details for a participant', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      name: 'MSG Run',
      players: [{ userId: 'user-1', user: { id: 'user-1', username: 'player1' } }],
      games: [],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/runs/run-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('run-1');
  });

  it('should return 404 for non-existent run', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/runs/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should return 403 for non-participant', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      players: [{ userId: 'other-user' }],
      games: [],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/runs/run-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/runs/join', () => {
  const token = makeToken('user-2', 'player2');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should join a run and auto-add to LOBBY games', async () => {
    (mockPrisma.run.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'run-1',
        inviteCode: 'RUN123',
        players: [{ userId: 'user-1' }],
        games: [
          { id: 'game-1', status: 'LOBBY', maxPlayers: 8, players: [{ userId: 'user-1' }] },
          { id: 'game-2', status: 'DRAFTING', maxPlayers: 8, players: [{ userId: 'user-1' }] },
        ],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        players: [
          { userId: 'user-1', user: { id: 'user-1', username: 'host' } },
          { userId: 'user-2', user: { id: 'user-2', username: 'player2' } },
        ],
        games: [],
      });

    (mockPrisma.runPlayer.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.gamePlayer.create as jest.Mock).mockResolvedValue({});

    const app = createApp();
    const res = await request(app)
      .post('/api/runs/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'RUN123' });

    expect(res.status).toBe(200);
    expect(mockPrisma.runPlayer.create).toHaveBeenCalled();
    // Should only add to LOBBY game, not DRAFTING
    expect(mockPrisma.gamePlayer.create).toHaveBeenCalledTimes(1);
  });

  it('should return 404 for invalid invite code', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/runs/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'XXXXXX' });

    expect(res.status).toBe(404);
  });

  it('should return 400 if already in run', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      players: [{ userId: 'user-2' }],
      games: [],
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/runs/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'RUN123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You are already in this run');
  });
});

describe('GET /api/runs/:id/standings', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return cumulative standings sorted by total points', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      name: 'MSG Run',
      venue: 'MSG',
      startDate: new Date('2026-12-28'),
      endDate: new Date('2026-12-31'),
      hostUserId: 'user-1',
      inviteCode: 'RUN123',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      players: [
        { userId: 'user-1', user: { id: 'user-1', username: 'player1' } },
        { userId: 'user-2', user: { id: 'user-2', username: 'player2' } },
      ],
      games: [
        {
          id: 'game-1',
          showDate: new Date('2026-12-28'),
          status: 'SCORED',
          picks: [
            { userId: 'user-1', isBonus: false, scored: true },
            { userId: 'user-1', isBonus: false, scored: false },
            { userId: 'user-2', isBonus: false, scored: true },
            { userId: 'user-2', isBonus: true, scored: true },
          ],
        },
        {
          id: 'game-2',
          showDate: new Date('2026-12-29'),
          status: 'SCORED',
          picks: [
            { userId: 'user-1', isBonus: false, scored: true },
            { userId: 'user-2', isBonus: false, scored: false },
          ],
        },
      ],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/runs/run-1/standings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.standings).toHaveLength(2);

    // user-2: game-1 = 1 + 2(bonus) = 3, game-2 = 0 → total = 3
    // user-1: game-1 = 1, game-2 = 1 → total = 2
    expect(res.body.standings[0].userId).toBe('user-2');
    expect(res.body.standings[0].totalPoints).toBe(3);
    expect(res.body.standings[0].rank).toBe(1);

    expect(res.body.standings[1].userId).toBe('user-1');
    expect(res.body.standings[1].totalPoints).toBe(2);
    expect(res.body.standings[1].rank).toBe(2);
  });

  it('should return 404 for non-existent run', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .get('/api/runs/nonexistent/standings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should return 403 for non-participant', async () => {
    (mockPrisma.run.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-1',
      players: [{ userId: 'other-user' }],
      games: [],
    });

    const app = createApp();
    const res = await request(app)
      .get('/api/runs/run-1/standings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
