import { scoreGame, findGamesToScore } from '../../services/scoring';
import { prisma } from '../../db';
import * as phishnet from '../../services/phishnet';

// Mock Prisma
jest.mock('../../db', () => ({
  prisma: {
    game: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    pick: {
      update: jest.fn(),
    },
  },
}));

// Mock phishnet service
jest.mock('../../services/phishnet', () => ({
  fetchSetlistByDate: jest.fn(),
}));

// Mock stats service
jest.mock('../../services/stats', () => ({
  recomputeUserStats: jest.fn().mockResolvedValue(undefined),
}));

// Mock runs route
jest.mock('../../routes/runs', () => ({
  updateRunStatus: jest.fn().mockResolvedValue(undefined),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFetchSetlist = phishnet.fetchSetlistByDate as jest.MockedFunction<typeof phishnet.fetchSetlistByDate>;

describe('scoreGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should score picks correctly against a setlist', async () => {
    const gameId = 'game-1';
    const mockGame = {
      id: gameId,
      status: 'LOCKED',
      showDate: new Date('2025-08-15'),
      picks: [
        { id: 'pick-1', songName: 'Tweezer', isBonus: false, userId: 'user-1' },
        { id: 'pick-2', songName: 'Wrong Song', isBonus: false, userId: 'user-1' },
        { id: 'pick-3', songName: 'Fluffhead', isBonus: false, userId: 'user-2' },
        { id: 'pick-4', songName: 'Stash', isBonus: true, userId: 'user-2' },
      ],
      players: [
        { userId: 'user-1', user: { id: 'user-1', username: 'player1' } },
        { userId: 'user-2', user: { id: 'user-2', username: 'player2' } },
      ],
    };

    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(mockGame);
    mockFetchSetlist.mockResolvedValue(['Tweezer', 'Fluffhead', 'Stash', 'YEM']);
    (mockPrisma.pick.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.game.update as jest.Mock).mockResolvedValue({});

    await scoreGame(gameId);

    // Check picks were updated
    expect(mockPrisma.pick.update).toHaveBeenCalledTimes(4);
    expect(mockPrisma.pick.update).toHaveBeenCalledWith({
      where: { id: 'pick-1' },
      data: { scored: true },
    });
    expect(mockPrisma.pick.update).toHaveBeenCalledWith({
      where: { id: 'pick-2' },
      data: { scored: false },
    });
    expect(mockPrisma.pick.update).toHaveBeenCalledWith({
      where: { id: 'pick-3' },
      data: { scored: true },
    });
    expect(mockPrisma.pick.update).toHaveBeenCalledWith({
      where: { id: 'pick-4' },
      data: { scored: true },
    });

    // Check game status was updated to SCORED
    expect(mockPrisma.game.update).toHaveBeenCalledWith({
      where: { id: gameId },
      data: { status: 'SCORED' },
    });
  });

  it('should throw if game not found', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(scoreGame('nonexistent')).rejects.toThrow('Game not found');
  });

  it('should throw if game is not in LOCKED status', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOBBY',
      picks: [],
      players: [],
    });

    await expect(scoreGame('game-1')).rejects.toThrow('Game must be in LOCKED status to score');
  });

  it('should throw if no setlist found', async () => {
    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-1',
      status: 'LOCKED',
      showDate: new Date('2025-08-15'),
      picks: [],
      players: [],
    });
    mockFetchSetlist.mockResolvedValue([]);

    await expect(scoreGame('game-1')).rejects.toThrow('No setlist found for this show date');
  });

  it('should handle case-insensitive song matching', async () => {
    const mockGame = {
      id: 'game-1',
      status: 'LOCKED',
      showDate: new Date('2025-08-15'),
      picks: [
        { id: 'pick-1', songName: 'tweezer', isBonus: false, userId: 'user-1' },
      ],
      players: [{ userId: 'user-1', user: { id: 'user-1', username: 'p1' } }],
    };

    (mockPrisma.game.findUnique as jest.Mock).mockResolvedValue(mockGame);
    mockFetchSetlist.mockResolvedValue(['Tweezer']);
    (mockPrisma.pick.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.game.update as jest.Mock).mockResolvedValue({});

    await scoreGame('game-1');

    expect(mockPrisma.pick.update).toHaveBeenCalledWith({
      where: { id: 'pick-1' },
      data: { scored: true },
    });
  });
});

describe('findGamesToScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return IDs of games ready to score', async () => {
    (mockPrisma.game.findMany as jest.Mock).mockResolvedValue([
      { id: 'game-1' },
      { id: 'game-2' },
    ]);

    const result = await findGamesToScore();

    expect(result).toEqual(['game-1', 'game-2']);
    expect(mockPrisma.game.findMany).toHaveBeenCalledWith({
      where: {
        status: 'LOCKED',
        showDate: { lt: expect.any(Date) },
      },
      select: { id: true },
    });
  });

  it('should return empty array when no games to score', async () => {
    (mockPrisma.game.findMany as jest.Mock).mockResolvedValue([]);

    const result = await findGamesToScore();

    expect(result).toEqual([]);
  });
});
