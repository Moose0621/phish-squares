import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import leaderboardRouter from '../../routes/leaderboard';
import { prisma } from '../../db';

// Mock Prisma
jest.mock('../../db', () => ({
  prisma: {
    userStats: {
      findMany: jest.fn(),
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
  app.use('/api/leaderboard', leaderboardRouter);
  return app;
}

function makeToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, 'test-secret', { expiresIn: '1h' });
}

describe('GET /api/leaderboard', () => {
  const token = makeToken('user-1', 'player1');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return leaderboard sorted by points (default)', async () => {
    (mockPrisma.userStats.findMany as jest.Mock).mockResolvedValue([
      {
        userId: 'user-2',
        gamesPlayed: 5,
        gamesWon: 3,
        totalPicks: 50,
        correctPicks: 20,
        totalPoints: 30,
        currentStreak: 2,
        user: { id: 'user-2', username: 'player2' },
      },
      {
        userId: 'user-1',
        gamesPlayed: 3,
        gamesWon: 1,
        totalPicks: 30,
        correctPicks: 10,
        totalPoints: 15,
        currentStreak: 0,
        user: { id: 'user-1', username: 'player1' },
      },
    ]);

    const app = createApp();
    const res = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].rank).toBe(1);
    expect(res.body[0].userId).toBe('user-2');
    expect(res.body[0].totalPoints).toBe(30);
    expect(res.body[0].winRate).toBe(60); // 3/5 * 100
    expect(res.body[0].accuracy).toBe(40); // 20/50 * 100
    expect(res.body[1].rank).toBe(2);
    expect(res.body[1].userId).toBe('user-1');
  });

  it('should support sorting by wins', async () => {
    (mockPrisma.userStats.findMany as jest.Mock).mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/leaderboard?sort=wins')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.userStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { gamesWon: 'desc' },
      }),
    );
  });

  it('should support sorting by accuracy', async () => {
    (mockPrisma.userStats.findMany as jest.Mock).mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/leaderboard?sort=accuracy')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.userStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { correctPicks: 'desc' },
      }),
    );
  });

  it('should support sorting by streak', async () => {
    (mockPrisma.userStats.findMany as jest.Mock).mockResolvedValue([]);

    const app = createApp();
    const res = await request(app)
      .get('/api/leaderboard?sort=streak')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.userStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { currentStreak: 'desc' },
      }),
    );
  });

  it('should return 401 without auth', async () => {
    const app = createApp();
    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(401);
  });
});
