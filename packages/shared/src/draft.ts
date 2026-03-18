import { DEFAULT_TOTAL_ROUNDS } from './types';

/**
 * Fisher-Yates shuffle to randomize draft order.
 * Returns a new array with elements in random order.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate a randomized draft order from player IDs.
 */
export function generateDraftOrder(playerIds: string[]): string[] {
  return shuffleArray(playerIds);
}

/**
 * Determines the sequence of picks for a given round in a snake draft.
 *
 * Snake draft pattern:
 * - Odd rounds (1, 3, 5...): forward order (0 → N-1)
 * - Even rounds (2, 4, 6...): reverse order (N-1 → 0)
 * - The "end cap" player (last in sequence) gets 2 consecutive picks
 *
 * For N players, each round produces N+1 picks (end cap gets double).
 *
 * Actually, in a true snake draft:
 * Round 1: A, B, C, D
 * Round 2: D, C, B, A
 * The "end cap" concept means D picks last in R1 and first in R2 — effectively 2 consecutive picks.
 * So each round has exactly N picks, and the snake naturally gives the end cap 2 consecutive picks across rounds.
 */
export function getRoundPickOrder(
  draftOrder: string[],
  round: number,
): string[] {
  const isForward = round % 2 === 1; // Odd rounds go forward
  if (isForward) {
    return [...draftOrder];
  } else {
    return [...draftOrder].reverse();
  }
}

export interface NextPickInfo {
  userId: string;
  round: number;
  pickIndexInRound: number;
  isBonus: boolean;
  isDraftComplete: boolean;
}

/**
 * Get who picks next given the current state of the draft.
 *
 * @param draftOrder - Array of user IDs in initial draft order
 * @param totalPicksMade - How many picks have been made so far
 * @param totalRounds - Total number of rounds (default 11, with round 11 being bonus)
 * @returns NextPickInfo with the user who picks next
 */
export function getNextPick(
  draftOrder: string[],
  totalPicksMade: number,
  totalRounds: number = DEFAULT_TOTAL_ROUNDS,
): NextPickInfo {
  const numPlayers = draftOrder.length;
  const picksPerRound = numPlayers;
  const totalPicks = picksPerRound * totalRounds;

  if (totalPicksMade >= totalPicks) {
    return {
      userId: '',
      round: totalRounds,
      pickIndexInRound: picksPerRound - 1,
      isBonus: true,
      isDraftComplete: true,
    };
  }

  const round = Math.floor(totalPicksMade / picksPerRound) + 1;
  const pickIndexInRound = totalPicksMade % picksPerRound;
  const roundOrder = getRoundPickOrder(draftOrder, round);
  const userId = roundOrder[pickIndexInRound];
  const isBonus = round === totalRounds;

  return {
    userId,
    round,
    pickIndexInRound,
    isBonus,
    isDraftComplete: false,
  };
}

/**
 * Check if a specific round is complete.
 */
export function isRoundComplete(
  totalPicksMade: number,
  draftOrder: string[],
  round: number,
): boolean {
  const picksPerRound = draftOrder.length;
  return totalPicksMade >= round * picksPerRound;
}

/**
 * Check if the entire draft is complete.
 */
export function isDraftComplete(
  totalPicksMade: number,
  draftOrder: string[],
  totalRounds: number = DEFAULT_TOTAL_ROUNDS,
): boolean {
  return totalPicksMade >= draftOrder.length * totalRounds;
}

/**
 * Get the full pick sequence for the entire draft.
 * Useful for displaying the draft board.
 */
export function getFullDraftSequence(
  draftOrder: string[],
  totalRounds: number = DEFAULT_TOTAL_ROUNDS,
): { userId: string; round: number; pickIndex: number; isBonus: boolean }[] {
  const sequence: { userId: string; round: number; pickIndex: number; isBonus: boolean }[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const roundOrder = getRoundPickOrder(draftOrder, round);
    for (let i = 0; i < roundOrder.length; i++) {
      sequence.push({
        userId: roundOrder[i],
        round,
        pickIndex: i,
        isBonus: round === totalRounds,
      });
    }
  }

  return sequence;
}

/**
 * Validate that a song hasn't already been picked in this game.
 */
export function isSongAvailable(
  songName: string,
  existingPicks: { songName: string }[],
): boolean {
  const normalized = songName.trim().toLowerCase();
  return !existingPicks.some(
    (pick) => pick.songName.trim().toLowerCase() === normalized,
  );
}

/**
 * Generate a random invite code (6 uppercase alphanumeric characters).
 */
export function generateInviteCode(length: number = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Calculate score for a single pick.
 * Bonus round picks are worth more points.
 */
export function calculatePickScore(
  isBonus: boolean,
  isCorrect: boolean,
  bonusMultiplier: number = 2,
): number {
  if (!isCorrect) return 0;
  return isBonus ? bonusMultiplier : 1;
}

/**
 * Score all picks for a game against an actual setlist.
 */
export function scoreGamePicks(
  picks: { songName: string; isBonus: boolean; userId: string }[],
  setlist: string[],
  bonusMultiplier: number = 2,
): Map<string, { correct: number; bonus: number; total: number }> {
  const normalizedSetlist = new Set(
    setlist.map((s) => s.trim().toLowerCase()),
  );
  const scores = new Map<string, { correct: number; bonus: number; total: number }>();

  for (const pick of picks) {
    const isCorrect = normalizedSetlist.has(pick.songName.trim().toLowerCase());
    const points = calculatePickScore(pick.isBonus, isCorrect, bonusMultiplier);

    const current = scores.get(pick.userId) ?? { correct: 0, bonus: 0, total: 0 };
    if (isCorrect) {
      current.correct += 1;
      if (pick.isBonus) current.bonus += 1;
    }
    current.total += points;
    scores.set(pick.userId, current);
  }

  return scores;
}
