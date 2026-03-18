import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type ms from 'ms';
import { registerSchema, loginSchema } from '@phish-squares/shared';
import { prisma } from '../db';
import { config } from '../config';
import { validate } from '../middleware/validate';
import { AuthPayload } from '../middleware/auth';

const router = Router();

const SALT_ROUNDS = 12;

router.post('/register', validate(registerSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { username, passwordHash },
  });

  const payload: AuthPayload = { userId: user.id, username: user.username };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as ms.StringValue });

  res.status(201).json({
    token,
    user: { id: user.id, username: user.username },
  });
});

router.post('/login', validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const payload: AuthPayload = { userId: user.id, username: user.username };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as ms.StringValue });

  res.json({
    token,
    user: { id: user.id, username: user.username },
  });
});

export default router;
