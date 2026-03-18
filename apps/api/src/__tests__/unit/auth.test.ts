import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import authRouter from '../../routes/auth';
import { prisma } from '../../db';
import { config } from '../../config';

// Mock Prisma
jest.mock('../../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
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
  app.use('/api/auth', authRouter);
  return app;
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register a new user and return a token', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      passwordHash: 'hashed',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toEqual({ id: 'user-1', username: 'testuser' });

    // Verify JWT is valid
    const decoded = jwt.verify(res.body.token, 'test-secret') as { userId: string; username: string };
    expect(decoded.userId).toBe('user-1');
    expect(decoded.username).toBe('testuser');
  });

  it('should return 409 if username is already taken', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'existing',
      username: 'testuser',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Username already taken');
  });

  it('should return 400 for invalid username (too short)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ab', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 400 for invalid password (too short)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 400 for missing fields', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/register')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should hash the password before storing', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockImplementation(async ({ data }) => {
      // Verify the password is hashed (bcrypt hashes start with $2b$)
      expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(data.passwordHash).not.toBe('password123');
      return { id: 'user-1', username: data.username, passwordHash: data.passwordHash };
    });

    const app = createApp();
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', password: 'password123' });

    expect(mockPrisma.user.create).toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a token for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('password123', 12);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      passwordHash,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toEqual({ id: 'user-1', username: 'testuser' });
  });

  it('should return 401 for non-existent user', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nouser', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('should return 401 for wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 12);
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      passwordHash,
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('should return 400 for missing fields', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });
});
