import { recomputeUserStats, recomputeAllStats } from '../../services/stats';
import { prisma } from '../../db';

// Mock Prisma
jest.mock('../../db', () => ({
  prisma: {
    gamePlayer: {
      findMany: jest.fn(),
    },
    runPlayer: {
      findMany: jest.fn(),
    },
    userStats: {
      upsert: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('recomputeUserStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.runPlayer.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.userStats.upsert as jest.Mock).mockResolvedValue({});
  });

  it('should compute stats for a user with scored games', async () => {
    (mockPrisma.gamePlayer.findMany as jest.Mock).mockResolvedValue([
      {
        userId: 'user-1',
        game: {
          id: 'game-1',
          showDate: new Date('2026-08-01'),
          status: 'SCORED',
          runId: null,
          picks: [
            { userId: 'user-1', isBonus: false, scored: true, songName: 'Tweezer' },
            { userId: 'user-1', isBonus: false, scored: false, songName: 'Stash' },
            { userId: 'user-1', isBonus: true, scored: true, songName: 'YEM' },
            { userId: 'user-2', isBonus: false, scored: true, songName: 'Fluffhead' },
          ],
          players: [
            { userId: 'user-1' },
            { userId: 'user-2' },
          ],
        },
      },
    ]);

    await recomputeUserStats('user-1');

    expect(mockPrisma.userStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({
          gamesPlayed: 1,
          totalPicks: 3,
          correctPicks: 2,
          totalPoints: 3, // 1 regular + 2 bonus
          bonusPicks: 1,
          bonusCorrect: 1,
          bestGamePoints: 3,
          gamesWon: 1, // user-1 has 3 points, user-2 has 1
          currentStreak: 1,
          longestStreak: 1,
        }),
        create: expect.objectContaining({
          userId: 'user-1',
          gamesPlayed: 1,
          totalPoints: 3,
        }),
      }),
    );
  });

  it('should compute zero stats for a user with no scored games', async () => {
    (mockPrisma.gamePlayer.findMany as jest.Mock).mockResolvedValue([]);

    await recomputeUserStats('user-1');

    expect(mockPrisma.userStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({
          gamesPlayed: 0,
          totalPoints: 0,
          gamesWon: 0,
          currentStreak: 0,
          longestStreak: 0,
        }),
      }),
    );
  });

  it('should correctly calculate streaks', async () => {
    // 3 games: correct, correct, miss (from oldest to newest)
    (mockPrisma.gamePlayer.findMany as jest.Mock).mockResolvedValue([
      {
        userId: 'user-1',
        game: {
          id: 'game-1', showDate: new Date('2026-01-01'), status: 'SCORED', runId: null,
          picks: [{ userId: 'user-1', isBonus: false, scored: true, songName: 'A' }],
          players: [{ userId: 'user-1' }],
        },
      },
      {
        userId: 'user-1',
        game: {
          id: 'game-2', showDate: new Date('2026-01-02'), status: 'SCORED', runId: null,
          picks: [{ userId: 'user-1', isBonus: false, scored: false, songName: 'B' }],
          players: [{ userId: 'user-1' }],
        },
      },
      {
        userId: 'user-1',
        game: {
          id: 'game-3', showDate: new Date('2026-01-03'), status: 'SCORED', runId: null,
          picks: [{ userId: 'user-1', isBonus: false, scored: true, songName: 'C' }],
          players: [{ userId: 'user-1' }],
        },
      },
    ]);

    await recomputeUserStats('user-1');

    expect(mockPrisma.userStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentStreak: 1, // only most recent game
          longestStreak: 1, // game-1 has 1, then broken, game-3 has 1
        }),
      }),
    );
  });

  it('should handle win detection with ties', async () => {
    // Both users tied at 1 point each — both win
    (mockPrisma.gamePlayer.findMany as jest.Mock).mockResolvedValue([
      {
        userId: 'user-1',
        game: {
          id: 'game-1', showDate: new Date('2026-01-01'), status: 'SCORED', runId: null,
          picks: [
            { userId: 'user-1', isBonus: false, scored: true, songName: 'A' },
            { userId: 'user-2', isBonus: false, scored: true, songName: 'B' },
          ],
          players: [{ userId: 'user-1' }, { userId: 'user-2' }],
        },
      },
    ]);

    await recomputeUserStats('user-1');

    expect(mockPrisma.userStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          gamesWon: 1, // tie = win for all tied players
        }),
      }),
    );
  });
});

describe('recomputeAllStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should recompute stats for all users', async () => {
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: 'user-1' },
      { id: 'user-2' },
    ]);
    (mockPrisma.gamePlayer.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.runPlayer.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.userStats.upsert as jest.Mock).mockResolvedValue({});

    const count = await recomputeAllStats();

    expect(count).toBe(2);
    expect(mockPrisma.userStats.upsert).toHaveBeenCalledTimes(2);
  });
});
