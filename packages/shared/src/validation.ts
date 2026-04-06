import { z } from 'zod';
import { DEFAULT_MAX_PLAYERS, DEFAULT_TOTAL_ROUNDS, MIN_PLAYERS } from './types';

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createGameSchema = z.object({
  showDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Show date must be in YYYY-MM-DD format'),
  showVenue: z
    .string()
    .min(1, 'Venue is required')
    .max(200, 'Venue must be at most 200 characters'),
  maxPlayers: z
    .number()
    .int()
    .min(MIN_PLAYERS)
    .max(DEFAULT_MAX_PLAYERS)
    .optional()
    .default(DEFAULT_MAX_PLAYERS),
  totalRounds: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(DEFAULT_TOTAL_ROUNDS),
});

export const joinGameSchema = z.object({
  inviteCode: z
    .string()
    .length(6, 'Invite code must be 6 characters')
    .regex(/^[A-Z0-9]+$/, 'Invite code must be uppercase alphanumeric'),
});

export const makePickSchema = z.object({
  songName: z
    .string()
    .min(1, 'Song name is required')
    .max(200, 'Song name must be at most 200 characters'),
});

export const createRunSchema = z.object({
  name: z
    .string()
    .min(1, 'Run name is required')
    .max(100, 'Run name must be at most 100 characters'),
  venue: z
    .string()
    .min(1, 'Venue is required')
    .max(200, 'Venue must be at most 200 characters'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: 'End date must be on or after start date', path: ['endDate'] },
);

export const joinRunSchema = z.object({
  inviteCode: z
    .string()
    .length(6, 'Invite code must be 6 characters')
    .regex(/^[A-Z0-9]+$/, 'Invite code must be uppercase alphanumeric'),
});
