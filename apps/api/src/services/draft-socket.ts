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

export function setupDraftSocket(io: Server): void {
  const draftNamespace = io.of('/draft');

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
      } catch (error) {
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

        // Create the pick
        const pick = await prisma.pick.create({
          data: {
            gameId: data.gameId,
            userId: user.userId,
            songName: parsed.data.songName,
            round: nextPick.round,
            pickOrder: game.picks.length,
            isBonus: nextPick.isBonus,
          },
        });

        // Clear existing timer
        clearPickTimer(data.gameId);

        // Broadcast the pick
        draftNamespace.to(data.gameId).emit(SocketEvent.PICK_MADE, {
          pick,
          userId: user.userId,
          username: user.username,
        });

        // Check if draft is complete
        const totalPicksNow = game.picks.length + 1;
        if (isDraftComplete(totalPicksNow, game.draftOrder, game.totalRounds)) {
          await prisma.game.update({
            where: { id: data.gameId },
            data: { status: 'LOCKED' },
          });
          draftNamespace.to(data.gameId).emit(SocketEvent.DRAFT_COMPLETE, {
            gameId: data.gameId,
          });
          return;
        }

        // Check round transition
        const newNextPick = getNextPick(game.draftOrder, totalPicksNow, game.totalRounds);
        if (newNextPick.round !== nextPick.round) {
          draftNamespace.to(data.gameId).emit(SocketEvent.ROUND_COMPLETE, {
            completedRound: nextPick.round,
            nextRound: newNextPick.round,
          });
        }

        // Update game state
        await prisma.game.update({
          where: { id: data.gameId },
          data: {
            currentRound: newNextPick.round,
            currentPickIndex: newNextPick.pickIndexInRound,
          },
        });

        // Send updated draft state
        const updatedGame = await prisma.game.findUnique({
          where: { id: data.gameId },
          include: {
            picks: { orderBy: [{ round: 'asc' }, { pickOrder: 'asc' }] },
            players: { include: { user: { select: { id: true, username: true } } } },
          },
        });

        if (updatedGame) {
          draftNamespace.to(data.gameId).emit(SocketEvent.DRAFT_STATE, {
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

        // Start new timer
        startPickTimer(draftNamespace, data.gameId, game.totalRounds);
      } catch (error) {
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

function startPickTimer(draftNamespace: ReturnType<Server['of']>, gameId: string, totalRounds: number): void {
  clearPickTimer(gameId);

  let remaining = PICK_TIMER_SECONDS;

  const timer = setInterval(async () => {
    remaining--;
    draftNamespace.to(gameId).emit(SocketEvent.TIMER_TICK, { seconds: remaining });

    if (remaining <= 0) {
      clearPickTimer(gameId);
      draftNamespace.to(gameId).emit(SocketEvent.AUTO_PICK, { gameId });
      // Auto-pick logic: skip turn (no pick made, move to next)
      // In production, you might want to auto-select a random available song
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
