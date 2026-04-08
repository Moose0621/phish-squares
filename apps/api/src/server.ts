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
import runsRouter from './routes/runs';
import usersRouter from './routes/users';
import leaderboardRouter from './routes/leaderboard';
import { setupDraftSocket } from './services/draft-socket';
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
app.use(express.json({ limit: '1mb' }));

// Rate limiting for auth endpoints (disabled in test environment)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  message: { error: 'Too many requests, please try again later' },
  skip: () => config.nodeEnv === 'test',
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/games', gamesRouter);
app.use('/api/songs', songsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/runs', runsRouter);
app.use('/api/users', usersRouter);
app.use('/api/leaderboard', leaderboardRouter);

// Setup WebSocket handlers
setupDraftSocket(io);

// Start server
if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-secret-change-in-production') {
  console.error('FATAL: JWT_SECRET must be set in production');
  process.exit(1);
}

httpServer.listen(config.port, () => {
  console.log(`🎸 Phish Squares API running on port ${config.port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  httpServer.close();
  process.exit(0);
});

export { app, httpServer, io };
