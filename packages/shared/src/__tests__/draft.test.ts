import {
  shuffleArray,
  generateDraftOrder,
  getRoundPickOrder,
  getNextPick,
  isRoundComplete,
  isDraftComplete,
  getFullDraftSequence,
  isSongAvailable,
  generateInviteCode,
  calculatePickScore,
  scoreGamePicks,
} from '../draft';

describe('shuffleArray', () => {
  it('should return an array of the same length', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffleArray(input);
    expect(result).toHaveLength(input.length);
  });

  it('should contain the same elements', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffleArray(input);
    expect(result.sort()).toEqual(input.sort());
  });

  it('should not mutate the original array', () => {
    const input = ['a', 'b', 'c', 'd'];
    const copy = [...input];
    shuffleArray(input);
    expect(input).toEqual(copy);
  });

  it('should handle single element array', () => {
    expect(shuffleArray(['a'])).toEqual(['a']);
  });

  it('should handle empty array', () => {
    expect(shuffleArray([])).toEqual([]);
  });
});

describe('generateDraftOrder', () => {
  it('should return an array with all player IDs', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const order = generateDraftOrder(players);
    expect(order.sort()).toEqual(players.sort());
  });
});

describe('getRoundPickOrder', () => {
  const draftOrder = ['A', 'B', 'C', 'D'];

  it('should return forward order for odd rounds', () => {
    expect(getRoundPickOrder(draftOrder, 1)).toEqual(['A', 'B', 'C', 'D']);
    expect(getRoundPickOrder(draftOrder, 3)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('should return reverse order for even rounds', () => {
    expect(getRoundPickOrder(draftOrder, 2)).toEqual(['D', 'C', 'B', 'A']);
    expect(getRoundPickOrder(draftOrder, 4)).toEqual(['D', 'C', 'B', 'A']);
  });

  it('should not mutate the original array', () => {
    const original = [...draftOrder];
    getRoundPickOrder(draftOrder, 2);
    expect(draftOrder).toEqual(original);
  });
});

describe('getNextPick', () => {
  const draftOrder = ['A', 'B', 'C', 'D'];
  const totalRounds = 3; // Smaller for testing

  it('should return first player for first pick', () => {
    const result = getNextPick(draftOrder, 0, totalRounds);
    expect(result.userId).toBe('A');
    expect(result.round).toBe(1);
    expect(result.pickIndexInRound).toBe(0);
    expect(result.isBonus).toBe(false);
    expect(result.isDraftComplete).toBe(false);
  });

  it('should return second player for second pick', () => {
    const result = getNextPick(draftOrder, 1, totalRounds);
    expect(result.userId).toBe('B');
    expect(result.round).toBe(1);
    expect(result.pickIndexInRound).toBe(1);
  });

  it('should return last player for last pick of round 1', () => {
    const result = getNextPick(draftOrder, 3, totalRounds);
    expect(result.userId).toBe('D');
    expect(result.round).toBe(1);
    expect(result.pickIndexInRound).toBe(3);
  });

  it('should reverse order in round 2 (snake)', () => {
    // Round 2: D, C, B, A
    const result = getNextPick(draftOrder, 4, totalRounds); // First pick of round 2
    expect(result.userId).toBe('D');
    expect(result.round).toBe(2);
    expect(result.pickIndexInRound).toBe(0);
  });

  it('should create end-cap effect (D picks last in R1, first in R2)', () => {
    const lastR1 = getNextPick(draftOrder, 3, totalRounds);
    const firstR2 = getNextPick(draftOrder, 4, totalRounds);
    expect(lastR1.userId).toBe('D'); // Last in round 1
    expect(firstR2.userId).toBe('D'); // First in round 2 = consecutive picks
  });

  it('should mark last round as bonus', () => {
    const totalPicks = draftOrder.length * (totalRounds - 1); // Start of last round
    const result = getNextPick(draftOrder, totalPicks, totalRounds);
    expect(result.round).toBe(totalRounds);
    expect(result.isBonus).toBe(true);
  });

  it('should indicate draft complete when all picks made', () => {
    const totalPicks = draftOrder.length * totalRounds;
    const result = getNextPick(draftOrder, totalPicks, totalRounds);
    expect(result.isDraftComplete).toBe(true);
  });

  it('should work with 2 players', () => {
    const order = ['X', 'Y'];
    // R1: X, Y | R2: Y, X | R3 (bonus): X, Y
    expect(getNextPick(order, 0, 3).userId).toBe('X');
    expect(getNextPick(order, 1, 3).userId).toBe('Y');
    expect(getNextPick(order, 2, 3).userId).toBe('Y'); // snake
    expect(getNextPick(order, 3, 3).userId).toBe('X');
    expect(getNextPick(order, 4, 3).userId).toBe('X'); // bonus round
    expect(getNextPick(order, 5, 3).userId).toBe('Y');
  });

  it('should work with 8 players', () => {
    const order = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const firstPick = getNextPick(order, 0, 2);
    expect(firstPick.userId).toBe('1');
    const lastPickR1 = getNextPick(order, 7, 2);
    expect(lastPickR1.userId).toBe('8');
    const firstPickR2 = getNextPick(order, 8, 2);
    expect(firstPickR2.userId).toBe('8'); // snake reversal
  });
});

describe('isRoundComplete', () => {
  const draftOrder = ['A', 'B', 'C', 'D'];

  it('should return false when round is not complete', () => {
    expect(isRoundComplete(3, draftOrder, 1)).toBe(false);
  });

  it('should return true when round is exactly complete', () => {
    expect(isRoundComplete(4, draftOrder, 1)).toBe(true);
  });

  it('should return true when more picks than round needs', () => {
    expect(isRoundComplete(5, draftOrder, 1)).toBe(true);
  });
});

describe('isDraftComplete', () => {
  const draftOrder = ['A', 'B', 'C', 'D'];

  it('should return false when draft is in progress', () => {
    expect(isDraftComplete(10, draftOrder, 11)).toBe(false);
  });

  it('should return true when all picks are made', () => {
    expect(isDraftComplete(44, draftOrder, 11)).toBe(true);
  });

  it('should return true when more picks than needed', () => {
    expect(isDraftComplete(50, draftOrder, 11)).toBe(true);
  });
});

describe('getFullDraftSequence', () => {
  it('should generate correct total picks', () => {
    const order = ['A', 'B', 'C'];
    const rounds = 3;
    const seq = getFullDraftSequence(order, rounds);
    expect(seq).toHaveLength(9); // 3 players * 3 rounds
  });

  it('should alternate direction correctly', () => {
    const order = ['A', 'B', 'C'];
    const seq = getFullDraftSequence(order, 3);
    // Round 1 (forward): A, B, C
    expect(seq[0].userId).toBe('A');
    expect(seq[1].userId).toBe('B');
    expect(seq[2].userId).toBe('C');
    // Round 2 (reverse): C, B, A
    expect(seq[3].userId).toBe('C');
    expect(seq[4].userId).toBe('B');
    expect(seq[5].userId).toBe('A');
    // Round 3 (forward, bonus): A, B, C
    expect(seq[6].userId).toBe('A');
    expect(seq[6].isBonus).toBe(true);
  });
});

describe('isSongAvailable', () => {
  const existingPicks = [
    { songName: 'Tweezer' },
    { songName: 'Fluffhead' },
    { songName: 'Bathtub Gin' },
  ];

  it('should return true for unpicked song', () => {
    expect(isSongAvailable('Stash', existingPicks)).toBe(true);
  });

  it('should return false for already picked song', () => {
    expect(isSongAvailable('Tweezer', existingPicks)).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(isSongAvailable('tweezer', existingPicks)).toBe(false);
    expect(isSongAvailable('TWEEZER', existingPicks)).toBe(false);
  });

  it('should trim whitespace', () => {
    expect(isSongAvailable('  Tweezer  ', existingPicks)).toBe(false);
  });
});

describe('generateInviteCode', () => {
  it('should generate a code of the specified length', () => {
    const code = generateInviteCode(6);
    expect(code).toHaveLength(6);
  });

  it('should only contain uppercase letters and digits (excluding confusing chars)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
  });

  it('should generate different codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateInviteCode());
    }
    // Very unlikely all 50 are the same
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('calculatePickScore', () => {
  it('should return 0 for incorrect pick', () => {
    expect(calculatePickScore(false, false)).toBe(0);
    expect(calculatePickScore(true, false)).toBe(0);
  });

  it('should return 1 for correct regular pick', () => {
    expect(calculatePickScore(false, true)).toBe(1);
  });

  it('should return multiplier for correct bonus pick', () => {
    expect(calculatePickScore(true, true)).toBe(2);
    expect(calculatePickScore(true, true, 3)).toBe(3);
  });
});

describe('scoreGamePicks', () => {
  const setlist = ['Tweezer', 'Fluffhead', 'Bathtub Gin', 'Stash', 'YEM'];

  it('should score picks correctly', () => {
    const picks = [
      { songName: 'Tweezer', isBonus: false, userId: 'p1' },
      { songName: 'Wrong Song', isBonus: false, userId: 'p1' },
      { songName: 'Fluffhead', isBonus: false, userId: 'p2' },
      { songName: 'Stash', isBonus: true, userId: 'p2' },
    ];

    const scores = scoreGamePicks(picks, setlist);

    const p1 = scores.get('p1')!;
    expect(p1.correct).toBe(1);
    expect(p1.total).toBe(1);

    const p2 = scores.get('p2')!;
    expect(p2.correct).toBe(2);
    expect(p2.bonus).toBe(1);
    expect(p2.total).toBe(3); // 1 regular + 2 bonus
  });

  it('should be case-insensitive for scoring', () => {
    const picks = [
      { songName: 'tweezer', isBonus: false, userId: 'p1' },
    ];
    const scores = scoreGamePicks(picks, setlist);
    expect(scores.get('p1')!.correct).toBe(1);
  });

  it('should handle empty picks', () => {
    const scores = scoreGamePicks([], setlist);
    expect(scores.size).toBe(0);
  });

  it('should handle empty setlist', () => {
    const picks = [
      { songName: 'Tweezer', isBonus: false, userId: 'p1' },
    ];
    const scores = scoreGamePicks(picks, []);
    expect(scores.get('p1')!.correct).toBe(0);
    expect(scores.get('p1')!.total).toBe(0);
  });
});
