// ── Game Status ──
export enum GameStatus {
  LOBBY = 'LOBBY',
  DRAFTING = 'DRAFTING',
  LOCKED = 'LOCKED',
  SCORED = 'SCORED',
}

// ── Run Status ──
export enum RunStatus {
  UPCOMING = 'UPCOMING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

// ── User ──
export interface User {
  id: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPublic {
  id: string;
  username: string;
  isAdmin?: boolean;
}

// ── Game ──
export interface Game {
  id: string;
  hostUserId: string;
  showDate: string; // YYYY-MM-DD
  showVenue: string;
  status: GameStatus;
  inviteCode: string;
  draftOrder: string[]; // array of user IDs
  currentRound: number;
  currentPickIndex: number;
  totalRounds: number;
  maxPlayers: number;
  runId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameWithPlayers extends Game {
  players: GamePlayer[];
  picks: Pick[];
}

// ── Game Player ──
export interface GamePlayer {
  id: string;
  gameId: string;
  userId: string;
  user?: UserPublic;
  draftPosition: number;
  joinedAt: Date;
}

// ── Pick ──
export interface Pick {
  id: string;
  gameId: string;
  userId: string;
  songName: string;
  round: number;
  pickOrder: number;
  isBonus: boolean;
  scored: boolean | null; // null = not yet scored
  createdAt: Date;
}

// ── Song ──
export interface Song {
  id: string;
  name: string;
  artist: string;
  timesPlayed: number;
  lastPlayed: string | null;
  isCustom: boolean;
}

// ── Draft State (real-time) ──
export interface DraftState {
  gameId: string;
  status: GameStatus;
  draftOrder: string[];
  currentRound: number;
  currentPickIndex: number;
  totalRounds: number;
  currentPickerUserId: string;
  isEndCap: boolean;
  picks: Pick[];
  players: (GamePlayer & { user: UserPublic })[];
  timerSeconds: number;
}

// ── Scoring ──
export interface ScoredPick extends Pick {
  scored: boolean;
}

export interface GameResult {
  gameId: string;
  hostUserId: string;
  status: GameStatus;
  showDate: string;
  showVenue: string;
  setlist: string[];
  playerResults: PlayerResult[];
}

export interface PlayerResult {
  userId: string;
  username: string;
  picks: ScoredPick[];
  totalPoints: number;
  rank: number;
}

// ── API Request/Response types ──
export interface RegisterRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserPublic;
}

export interface CreateGameRequest {
  showDate: string;
  showVenue: string;
  maxPlayers?: number;
  totalRounds?: number;
}

export interface JoinGameRequest {
  inviteCode: string;
}

export interface MakePickRequest {
  songName: string;
}

// ── Run ──
export interface Run {
  id: string;
  name: string;
  venue: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  hostUserId: string;
  inviteCode: string;
  status: RunStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunPlayer {
  id: string;
  runId: string;
  userId: string;
  user?: UserPublic;
  joinedAt: Date;
}

export interface RunStandings {
  run: Run;
  standings: Array<{
    userId: string;
    username: string;
    gameScores: Array<{
      gameId: string;
      showDate: string;
      points: number;
    }>;
    totalPoints: number;
    rank: number;
  }>;
}

// ── User Stats ──
export interface UserStats {
  id: string;
  userId: string;
  gamesPlayed: number;
  gamesWon: number;
  totalPicks: number;
  correctPicks: number;
  totalPoints: number;
  bonusPicks: number;
  bonusCorrect: number;
  bestGamePoints: number;
  currentStreak: number;
  longestStreak: number;
  runsParticipated: number;
  runsWon: number;
  lastPlayedAt: Date | null;
  updatedAt: Date;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  accuracy: number;
  totalPoints: number;
  currentStreak: number;
}

// ── Create Run Request ──
export interface CreateRunRequest {
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
}

export interface JoinRunRequest {
  inviteCode: string;
}

// ── Socket Events ──
export enum SocketEvent {
  JOIN_DRAFT = 'join-draft',
  LEAVE_DRAFT = 'leave-draft',
  DRAFT_STATE = 'draft-state',
  MAKE_PICK = 'make-pick',
  PICK_MADE = 'pick-made',
  ROUND_COMPLETE = 'round-complete',
  DRAFT_COMPLETE = 'draft-complete',
  TIMER_TICK = 'timer-tick',
  AUTO_PICK = 'auto-pick',
  PLAYER_CONNECTED = 'player-connected',
  PLAYER_DISCONNECTED = 'player-disconnected',
  ERROR = 'error',
}

// ── Constants ──
export const DEFAULT_TOTAL_ROUNDS = 11; // 10 regular + 1 bonus
export const DEFAULT_MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;
export const PICK_TIMER_SECONDS = 60;
export const BONUS_ROUND_MULTIPLIER = 2;
export const INVITE_CODE_LENGTH = 6;
