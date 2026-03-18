import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import {
  SocketEvent,
  PICK_TIMER_SECONDS,
  makePickSchema,
} from '@phish-squares/shared';
import { getNextPick, isDraftComplete, isSongAvailable } from '@phish-squares/shared';
import { prisma } from '../db';
import { config } from '../config';
import { AuthPayload } from '../middleware/auth';

// Track timers per game
const gameTimers = new Map<string, NodeJS.Timeout>();

// Module-level reference so games.ts can emit to lobby rooms
let _draftNamespace: ReturnType<Server['of']> | null = null;

/**
 * Emit an event to all sockets in a game room.
 * Used by the games router to push lobby-update events.
 */
export function emitToGameRoom(gameId: string, event: string, data: unknown): void {
  _draftNamespace?.to(gameId).emit(event, data);
}

interface PickEntry {
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

interface PlayerEntry {
  userId: string;
  user: { id: string; username: string };
}

interface GameForPick {
  id: string;
  draftOrder: string[];
  totalRounds: number;
  picks: PickEntry[];
  players: PlayerEntry[];
}

/**
 * Shared pick-creation logic used by both MAKE_PICK and auto-pick.
 * Creates the pick, broadcasts events, checks completion, and advances state.
 */
async function executePick(
  draftNamespace: ReturnType<Server['of']>,
  gameId: string,
  pickerUserId: string,
  pickerUsername: string,
  songName: string,
  game: GameForPick,
): Promise<void> {
  const nextPick = getNextPick(game.draftOrder, game.picks.length, game.totalRounds);

  // Create the pick record
  const pick = await prisma.pick.create({
    data: {
      gameId,
      userId: pickerUserId,
      songName,
      round: nextPick.round,
      pickOrder: game.picks.length,
      isBonus: nextPick.isBonus,
    },
  });

  // Clear existing timer
  clearPickTimer(gameId);

  // Broadcast the pick
  draftNamespace.to(gameId).emit(SocketEvent.PICK_MADE, {
    pick,
    userId: pickerUserId,
    username: pickerUsername,
  });

  const totalPicksNow = game.picks.length + 1;

  // Check if draft is complete
  if (isDraftComplete(totalPicksNow, game.draftOrder, game.totalRounds)) {
    await prisma.game.update({
      where: { id: gameId },
      data: { status: 'LOCKED' },
    });
    draftNamespace.to(gameId).emit(SocketEvent.DRAFT_COMPLETE, { gameId });
    return;
  }

  // Check round transition
  const newNextPick = getNextPick(game.draftOrder, totalPicksNow, game.totalRounds);
  if (newNextPick.round !== nextPick.round) {
    draftNamespace.to(gameId).emit(SocketEvent.ROUND_COMPLETE, {
      completedRound: nextPick.round,
      nextRound: newNextPick.round,
    });
  }

  // Update game state
  await prisma.game.update({
    where: { id: gameId },
    data: {
      currentRound: newNextPick.round,
      currentPickIndex: newNextPick.pickIndexInRound,
    },
  });

  // Send updated draft state
  const updatedGame = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      picks: { orderBy: [{ round: 'asc' }, { pickOrder: 'asc' }] },
      players: { include: { user: { select: { id: true, username: true } } } },
    },
  });

  if (updatedGame) {
    draftNamespace.to(gameId).emit(SocketEvent.DRAFT_STATE, {
      gameId: updatedGame.id,
      status: updatedGame.status,
      draftOrder: updatedGame.draftOrder,
      currentRound: newNextPick.round,
      currentPickIndex: newNextPick.pickIndexInRound,
      totalRounds: updatedGame.totalRounds,
      currentPickerUserId: newNextPick.userId,
      isEndCap: false,
      picks: updatedGame.picks,
      players: updatedGame.players,
      timerSeconds: PICK_TIMER_SECONDS,
    });
  }

  // Start next pick timer
  startPickTimer(draftNamespace, gameId, game.totalRounds);
}

export function setupDraftSocket(io: Server): void {
  const draftNamespace = io.of('/draft');
  _draftNamespace = draftNamespace;

  // Authenticate socket connections
  draftNamespace.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  draftNamespace.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthPayload;

    socket.on(SocketEvent.JOIN_DRAFT, async (gameId: string) => {
      try {
        const game = await prisma.game.findUnique({
          where: { id: gameId },
          include: {
            players: { include: { user: { select: { id: true, username: true } } } },
            picks: { orderBy: [{ round: 'asc' }, { pickOrder: 'asc' }] },
          },
        });

        if (!game) {
          socket.emit(SocketEvent.ERROR, 'Game not found');
          return;
        }

        const isPlayer = game.players.some((p) => p.userId === user.userId);
        if (!isPlayer) {
          socket.emit(SocketEvent.ERROR, 'You are not a player in this game');
          return;
        }

        // Join the game room
        await socket.join(gameId);

        // Notify others
        socket.to(gameId).emit(SocketEvent.PLAYER_CONNECTED, {
          userId: user.userId,
          username: user.username,
        });

        // Notify all lobby members of the updated player list
        if (game.status === 'LOBBY') {
          draftNamespace.to(gameId).emit('lobby-update', game);
        }

        // Send current draft state
        const nextPick = getNextPick(game.draftOrder, game.picks.length, game.totalRounds);
        draftNamespace.to(gameId).emit(SocketEvent.DRAFT_STATE, {
          gameId: game.id,
          status: game.status,
          draftOrder: game.draftOrder,
          currentRound: nextPick.round,
          currentPickIndex: nextPick.pickIndexInRound,
          totalRounds: game.totalRounds,
          currentPickerUserId: nextPick.userId,
          isEndCap: false,
          picks: game.picks,
          players: game.players,
          timerSeconds: PICK_TIMER_SECONDS,
        });

        // Start pick timer if drafting
        if (game.status === 'DRAFTING' && !nextPick.isDraftComplete) {
          startPickTimer(draftNamespace, gameId, game.totalRounds);
        }
      } catch {
        socket.emit(SocketEvent.ERROR, 'Failed to join draft');
      }
    });

    socket.on(SocketEvent.MAKE_PICK, async (data: { gameId: string; songName: string }) => {
      try {
        const parsed = makePickSchema.safeParse({ songName: data.songName });
        if (!parsed.success) {
          socket.emit(SocketEvent.ERROR, 'Invalid song name');
          return;
        }

        const game = await prisma.game.findUnique({
          where: { id: data.gameId },
          include: {
            picks: { orderBy: [{ round: 'asc' }, { pickOrder: 'asc' }] },
            players: { include: { user: { select: { id: true, username: true } } } },
          },
        });

        if (!game || game.status !== 'DRAFTING') {
          socket.emit(SocketEvent.ERROR, 'Game is not in drafting state');
          return;
        }

        const nextPick = getNextPick(game.draftOrder, game.picks.length, game.totalRounds);
        if (nextPick.isDraftComplete) {
          socket.emit(SocketEvent.ERROR, 'Draft is already complete');
          return;
        }

        if (nextPick.userId !== user.userId) {
          socket.emit(SocketEvent.ERROR, 'It is not your turn to pick');
          return;
        }

        // Check song availability
        if (!isSongAvailable(parsed.data.songName, game.picks)) {
          socket.emit(SocketEvent.ERROR, 'Song has already been picked');
          return;
        }

        await executePick(draftNamespace, data.gameId, user.userId, user.username, parsed.data.songName, game);
      } catch {
        socket.emit(SocketEvent.ERROR, 'Failed to make pick');
      }
    });

    socket.on(SocketEvent.LEAVE_DRAFT, async (gameId: string) => {
      await socket.leave(gameId);
      socket.to(gameId).emit(SocketEvent.PLAYER_DISCONNECTED, {
        userId: user.userId,
        username: user.username,
      });
    });

    socket.on('disconnect', () => {
      // Notify all rooms this socket was in
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket.to(room).emit(SocketEvent.PLAYER_DISCONNECTED, {
            userId: user.userId,
            username: user.username,
          });
        }
      }
    });
  });
}

function startPickTimer(draftNamespace: ReturnType<Server['of']>, gameId: string, _totalRounds: number): void {
  clearPickTimer(gameId);

  let remaining = PICK_TIMER_SECONDS;

  const timer = setInterval(() => {
    remaining--;
    draftNamespace.to(gameId).emit(SocketEvent.TIMER_TICK, { seconds: remaining });

    if (remaining <= 0) {
      clearPickTimer(gameId);
      draftNamespace.to(gameId).emit(SocketEvent.AUTO_PICK, { gameId });

      // Auto-pick: select a random available song and create the pick
      void (async () => {
        try {
          const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
              picks: { orderBy: [{ round: 'asc' }, { pickOrder: 'asc' }] },
              players: { include: { user: { select: { id: true, username: true } } } },
            },
          });

          if (!game || game.status !== 'DRAFTING') return;

          const nextPick = getNextPick(game.draftOrder, game.picks.length, game.totalRounds);
          if (nextPick.isDraftComplete) return;

          // Find available songs (case-insensitive exclusion of already-picked songs)
          const pickedNamesLower = new Set(game.picks.map((p) => p.songName.toLowerCase().trim()));
          const allSongs = await prisma.song.findMany({ select: { name: true } });
          const available = allSongs.filter((s) => !pickedNamesLower.has(s.name.toLowerCase().trim()));

          if (available.length === 0) {
            console.warn(`Auto-pick skipped for game ${gameId}: no songs available`);
            return;
          }

          const randomIndex = Math.floor(Math.random() * available.length);
          const song = available[randomIndex];
          if (!song) return;

          const picker = game.players.find((p) => p.userId === nextPick.userId);
          await executePick(
            draftNamespace,
            gameId,
            nextPick.userId,
            picker?.user.username ?? 'Unknown',
            song.name,
            game,
          );
        } catch (err) {
          console.error(`Auto-pick failed for game ${gameId}:`, err);
        }
      })();
    }
  }, 1000);

  gameTimers.set(gameId, timer);
}

function clearPickTimer(gameId: string): void {
  const timer = gameTimers.get(gameId);
  if (timer) {
    clearInterval(timer);
    gameTimers.delete(gameId);
  }
}
