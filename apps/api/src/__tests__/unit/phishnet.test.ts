import * as phishnet from '../../services/phishnet';
import { prisma } from '../../db';
import { config } from '../../config';

// Mock prisma
jest.mock('../../db', () => ({
  prisma: {
    song: {
      upsert: jest.fn(),
    },
  },
}));

// Mock config
jest.mock('../../config', () => ({
  config: {
    phishNetApiKey: 'test-api-key',
    phishNetBaseUrl: 'https://api.phish.net/v5',
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('syncSongsFromPhishNet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should sync songs from Phish.net and upsert into database', async () => {
    const mockSongs = [
      { songid: 1, song: 'Tweezer', times_played: 300, last_played: '2025-01-01' },
      { songid: 2, song: 'Fluffhead', times_played: 200, last_played: '2025-02-01' },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error_code: 0, error_message: null, data: mockSongs }),
    });
    (mockPrisma.song.upsert as jest.Mock).mockResolvedValue({});

    const count = await phishnet.syncSongsFromPhishNet();

    expect(count).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.phish.net/v5/songs.json?apikey=test-api-key',
    );
    expect(mockPrisma.song.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.song.upsert).toHaveBeenCalledWith({
      where: { phishNetId: 1 },
      update: { name: 'Tweezer', timesPlayed: 300, lastPlayed: '2025-01-01' },
      create: { phishNetId: 1, name: 'Tweezer', timesPlayed: 300, lastPlayed: '2025-01-01' },
    });
  });

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(phishnet.syncSongsFromPhishNet()).rejects.toThrow(
      'Phish.net API error: 500 Internal Server Error',
    );
  });

  it('should throw on Phish.net API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error_code: 1, error_message: 'Bad API key', data: [] }),
    });

    await expect(phishnet.syncSongsFromPhishNet()).rejects.toThrow(
      'Phish.net API error: Bad API key',
    );
  });
});

describe('fetchSetlistByDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and return unique song names from setlist', async () => {
    const mockSetlist = [
      { song: 'Tweezer', set: '1', position: 1 },
      { song: 'Fluffhead', set: '1', position: 2 },
      { song: 'Stash', set: '2', position: 1 },
      { song: 'Tweezer', set: '2', position: 2 }, // Duplicate
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error_code: 0, error_message: null, data: mockSetlist }),
    });

    const result = await phishnet.fetchSetlistByDate('2025-08-15');

    expect(result).toEqual(['Tweezer', 'Fluffhead', 'Stash']);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.phish.net/v5/setlists/showdate/2025-08-15.json?apikey=test-api-key',
    );
  });

  it('should return empty array when no setlist data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error_code: 0, error_message: null, data: [] }),
    });

    const result = await phishnet.fetchSetlistByDate('2025-01-01');
    expect(result).toEqual([]);
  });

  it('should return empty array when data is null', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error_code: 0, error_message: null, data: null }),
    });

    const result = await phishnet.fetchSetlistByDate('2025-01-01');
    expect(result).toEqual([]);
  });

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(phishnet.fetchSetlistByDate('2025-01-01')).rejects.toThrow(
      'Phish.net API error: 404 Not Found',
    );
  });

  it('should throw on Phish.net API error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error_code: 2, error_message: 'Rate limited', data: [] }),
    });

    await expect(phishnet.fetchSetlistByDate('2025-01-01')).rejects.toThrow(
      'Phish.net API error: Rate limited',
    );
  });
});
