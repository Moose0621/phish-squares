import express from 'express';
import request from 'supertest';
import authRouter from '../../routes/auth';
import gamesRouter from '../../routes/games';

/**
 * Integration test for the full game flow.
 * Uses mocked Prisma to test the API layer without a database.
 * This simulates: register → login → create game → join → start → score → results
 */

interface TestUser {
  id: string;
  username: string;
  passwordHash: string;
}

interface TestGame {
  id: string;
  hostUserId: string;
  showDate: Date;
  showVenue: string;
  status: string;
  inviteCode: string;
  draftOrder: string[];
  currentRound: number;
  currentPickIndex: number;
  totalRounds: number;
  maxPlayers: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TestGamePlayer {
  id: string;
  gameId: string;
  userId: string;
  draftPosition: number;
  joinedAt: Date;
}

interface TestPick {
  id: string;
  gameId: string;
  userId: string;
  songName: string;
  round: number;
  pickOrder: number;
  isBonus: boolean;
  scored: boolean | null;
  createdAt: Date;
}

// In-memory data store for integration simulation
let users: TestUser[] = [];
let games: TestGame[] = [];
let gamePlayers: TestGamePlayer[] = [];
let picks: TestPick[] = [];
let idCounter = 1;

function generateId() {
  return `id-${idCounter++}`;
}

// Mock config
jest.mock('../../config', () => ({
  config: {
    jwtSecret: 'integration-test-secret',
    jwtExpiresIn: '1h',
  },
}));

// Mock scoring service
jest.mock('../../services/scoring', () => ({
  scoreGame: jest.fn(async (gameId: string) => {
    const game = games.find((g) => g.id === gameId);
    if (!game) throw new Error('Game not found');
    if (game.status !== 'LOCKED') throw new Error('Game must be in LOCKED status to score');

    // Simulate scoring: mark all picks as scored based on a mock setlist
    const mockSetlist = new Set(['tweezer', 'fluffhead', 'stash']);
    for (const pick of picks.filter((p) => p.gameId === gameId)) {
      pick.scored = mockSetlist.has(pick.songName.toLowerCase());
    }
    game.status = 'SCORED';
  }),
}));

// Mock phishnet service (used by results endpoint to fetch real setlist)
jest.mock('../../services/phishnet', () => ({
  fetchSetlistByDate: jest.fn(async () => ['Tweezer', 'Fluffhead', 'Stash']),
}));

// Mock Prisma with in-memory store
jest.mock('../../db', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bcryptLib = require('bcrypt');
  void bcryptLib; // Used implicitly by auth route via mock chain

  return {
    prisma: {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { username?: string; id?: string } }) => {
          return users.find((u) => u.username === where.username || u.id === where.id) || null;
        }),
        create: jest.fn(async ({ data }: { data: { username: string; passwordHash: string } }) => {
          const user: TestUser = { id: generateId(), ...data };
          users.push(user);
          return user;
        }),
      },
      game: {
        findUnique: jest.fn(async ({ where, include }: { where: { id?: string; inviteCode?: string }; include?: Record<string, unknown> }) => {
          let game: TestGame | undefined;
          if (where.id) {
            game = games.find((g) => g.id === where.id);
          } else if (where.inviteCode) {
            game = games.find((g) => g.inviteCode === where.inviteCode);
          }
          if (!game) return null;

          const result: Record<string, unknown> = { ...game };
          if (include?.players) {
            const playersInc = include.players as Record<string, unknown> | boolean;
            result.players = gamePlayers.filter((p) => p.gameId === game!.id);
            if (typeof playersInc === 'object' && (playersInc as Record<string, unknown>).include) {
              result.players = (result.players as TestGamePlayer[]).map((p) => ({
                ...p,
                user: users.find((u) => u.id === p.userId)
                  ? { id: p.userId, username: users.find((u) => u.id === p.userId)!.username }
                  : undefined,
              }));
            }
          }
          if (include?.picks) {
            result.picks = picks.filter((p) => p.gameId === game!.id);
          }
          if (include?.host) {
            const host = users.find((u) => u.id === game!.hostUserId);
            result.host = host ? { id: host.id, username: host.username } : null;
          }
          return result;
        }),
        findMany: jest.fn(async ({ where, include }: { where?: Record<string, unknown>; include?: Record<string, unknown> }) => {
          let filtered = games;
          if (where?.players) {
            const playersWhere = where.players as Record<string, Record<string, string>>;
            const userId = playersWhere.some.userId;
            const playerGameIds = gamePlayers.filter((p) => p.userId === userId).map((p) => p.gameId);
            filtered = games.filter((g) => playerGameIds.includes(g.id));
          }
          return filtered.map((game) => {
            const result: Record<string, unknown> = { ...game };
            if (include?.players) {
              const playersInc = include.players as Record<string, unknown> | boolean;
              result.players = gamePlayers
                .filter((p) => p.gameId === game.id)
                .map((p) => ({
                  ...p,
                  user: typeof playersInc === 'object' && (playersInc as Record<string, unknown>).include
                    ? { id: p.userId, username: users.find((u) => u.id === p.userId)?.username }
                    : undefined,
                }));
            }
            if (include?.host) {
              const host = users.find((u) => u.id === game.hostUserId);
              result.host = host ? { id: host.id, username: host.username } : null;
            }
            return result;
          });
        }),
        create: jest.fn(async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
          const game: TestGame = {
            id: generateId(),
            hostUserId: data.hostUserId as string,
            showDate: data.showDate as Date,
            showVenue: data.showVenue as string,
            status: 'LOBBY',
            inviteCode: data.inviteCode as string,
            draftOrder: [],
            currentRound: 0,
            currentPickIndex: 0,
            totalRounds: (data.totalRounds as number) || 11,
            maxPlayers: (data.maxPlayers as number) || 8,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          games.push(game);

          // Create player entries
          if (data.players) {
            const playersData = data.players as { create: { userId: string; draftPosition?: number } | Array<{ userId: string; draftPosition?: number }> };
            const playerArray = Array.isArray(playersData.create) ? playersData.create : [playersData.create];
            for (const pd of playerArray) {
              gamePlayers.push({
                id: generateId(),
                gameId: game.id,
                userId: pd.userId,
                draftPosition: pd.draftPosition || 0,
                joinedAt: new Date(),
              });
            }
          }

          const result: Record<string, unknown> = { ...game };
          if (include?.players) {
            const playersInc = include.players as Record<string, unknown> | boolean;
            result.players = gamePlayers
              .filter((p) => p.gameId === game.id)
              .map((p) => ({
                ...p,
                user: typeof playersInc === 'object' && (playersInc as Record<string, unknown>).include
                  ? { id: p.userId, username: users.find((u) => u.id === p.userId)?.username }
                  : undefined,
              }));
          }
          return result;
        }),
        update: jest.fn(async ({ where, data, include }: { where: { id: string }; data: Record<string, unknown>; include?: Record<string, unknown> }) => {
          const game = games.find((g) => g.id === where.id);
          if (!game) throw new Error('Game not found');
          Object.assign(game, data);
          const result: Record<string, unknown> = { ...game };
          if (include?.players) {
            const playersInc = include.players as Record<string, unknown> | boolean;
            result.players = gamePlayers
              .filter((p) => p.gameId === game.id)
              .map((p) => ({
                ...p,
                user: typeof playersInc === 'object' && (playersInc as Record<string, unknown>).include
                  ? { id: p.userId, username: users.find((u) => u.id === p.userId)?.username }
                  : undefined,
              }));
          }
          return result;
        }),
      },
      gamePlayer: {
        create: jest.fn(async ({ data }: { data: { gameId: string; userId: string; draftPosition: number } }) => {
          const player: TestGamePlayer = { id: generateId(), ...data, joinedAt: new Date() };
          gamePlayers.push(player);
          return player;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: { gameId: string; userId: string }; data: Record<string, unknown> }) => {
          const matching = gamePlayers.filter(
            (p) => p.gameId === where.gameId && p.userId === where.userId,
          );
          for (const p of matching) {
            Object.assign(p, data);
          }
          return { count: matching.length };
        }),
      },
    },
  };
});

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/games', gamesRouter);
  return app;
}

describe('Integration: Full Game Flow', () => {
  let app: express.Express;
  let hostToken: string;
  let playerToken: string;
  let gameId: string;
  let inviteCode: string;

  beforeAll(() => {
    // Reset in-memory store
    users = [];
    games = [];
    gamePlayers = [];
    picks = [];
    idCounter = 1;
    app = createApp();
  });

  it('Step 1: Host registers', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'hostplayer', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    hostToken = res.body.token;
  });

  it('Step 2: Player registers', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'joinplayer', password: 'password456' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    playerToken = res.body.token;
  });

  it('Step 3: Host creates a game', async () => {
    const res = await request(app)
      .post('/api/games')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ showDate: '2025-08-15', showVenue: 'MSG' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('inviteCode');
    gameId = res.body.id;
    inviteCode = res.body.inviteCode;
  });

  it('Step 4: Player joins the game', async () => {
    const res = await request(app)
      .post('/api/games/join')
      .set('Authorization', `Bearer ${playerToken}`)
      .send({ inviteCode });

    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(2);
  });

  it('Step 5: Host lists their games', async () => {
    const res = await request(app)
      .get('/api/games')
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('Step 6: Host starts the draft', async () => {
    const res = await request(app)
      .post(`/api/games/${gameId}/start`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
  });

  it('Step 7: Host gets game details', async () => {
    const res = await request(app)
      .get(`/api/games/${gameId}`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(gameId);
  });

  it('Step 8: Score the game (after manually setting LOCKED)', async () => {
    // Simulate that the game is now LOCKED (draft completed)
    const game = games.find((g) => g.id === gameId);
    expect(game).toBeDefined();
    game!.status = 'LOCKED';

    // Add some picks
    picks.push(
      { id: generateId(), gameId, userId: users[0].id, songName: 'Tweezer', round: 1, pickOrder: 0, isBonus: false, scored: null, createdAt: new Date() },
      { id: generateId(), gameId, userId: users[1].id, songName: 'Wrong Song', round: 1, pickOrder: 1, isBonus: false, scored: null, createdAt: new Date() },
    );

    const res = await request(app)
      .post(`/api/games/${gameId}/score`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Game scored successfully');
  });

  it('Step 9: Get game results', async () => {
    const res = await request(app)
      .get(`/api/games/${gameId}/results`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.gameId).toBe(gameId);
    expect(res.body.showVenue).toBe('MSG');
    expect(res.body).toHaveProperty('playerResults');
    // Setlist comes from the mocked fetchSetlistByDate, reflecting the real show setlist
    expect(res.body.setlist).toEqual(['Tweezer', 'Fluffhead', 'Stash']);
    expect(res.body.playerResults).toHaveLength(2);

    // Verify ranking
    const ranked = res.body.playerResults;
    expect(ranked[0].rank).toBe(1);
  });
});

describe('Integration: Auth Validation', () => {
  let app: express.Express;

  beforeAll(() => {
    users = [];
    games = [];
    gamePlayers = [];
    picks = [];
    idCounter = 100;
    app = createApp();
  });

  it('should reject game creation without auth', async () => {
    const res = await request(app)
      .post('/api/games')
      .send({ showDate: '2025-08-15', showVenue: 'MSG' });

    expect(res.status).toBe(401);
  });

  it('should reject duplicate registration', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'duplicate', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'duplicate', password: 'password456' });

    expect(res.status).toBe(409);
  });

  it('should login with registered credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'duplicate', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'duplicate', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });
});
