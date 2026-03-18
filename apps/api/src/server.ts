import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import authRouter from './routes/auth';
import gamesRouter from './routes/games';
import songsRouter from './routes/songs';
import adminRouter from './routes/admin';
import { setupDraftSocket } from './services/draft-socket';
import { ensureAdminExists } from './services/admin-seed';
import { findGamesToScore, scoreGame } from './services/scoring';
import { prisma } from './db';

const app = express();
const httpServer = createServer(app);

// Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: { error: 'Too many requests, please try again later' },
});

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/songs', songsRouter);
app.use('/api/admin', adminRouter);

// Setup WebSocket handlers
setupDraftSocket(io);

// Start server
async function start(): Promise<void> {
  try {
    await ensureAdminExists();
  } catch (err) {
    console.error('Failed to seed admin user:', err);
  }

  // Polling job: auto-score eligible games every 5 minutes
  const SCORING_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const gameIds = await findGamesToScore();
      for (const gameId of gameIds) {
        try {
          await scoreGame(gameId);
          console.log(`Auto-scored game ${gameId}`);
        } catch (err) {
          console.error(`Failed to auto-score game ${gameId}:`, err);
        }
      }
    } catch (err) {
      console.error('Failed to find games to score:', err);
    }
  }, SCORING_INTERVAL_MS);

  httpServer.listen(config.port, () => {
    console.log(`🎸 Phish Squares API running on port ${config.port}`);
  });
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});

export { app, httpServer, io };
