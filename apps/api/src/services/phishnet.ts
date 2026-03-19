import { config } from '../config';
import { prisma } from '../db';

interface PhishNetSong {
  songid: number;
  song: string;
  times_played: number;
  last_played: string | null;
}

interface PhishNetSetlistEntry {
  song: string;
  set: string;
  position: number;
}

interface PhishNetResponse<T> {
  error_code: number;
  error_message: string | null;
  data: T;
}

/**
 * Fetch songs from Phish.net API and cache them in the database.
 */
export async function syncSongsFromPhishNet(): Promise<number> {
  const url = `${config.phishNetBaseUrl}/songs.json?apikey=${encodeURIComponent(config.phishNetApiKey)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Phish.net API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as PhishNetResponse<PhishNetSong[]>;
  if (json.error_code !== 0) {
    throw new Error(`Phish.net API error: ${json.error_message}`);
  }

  let upsertCount = 0;
  for (const song of json.data) {
    await prisma.song.upsert({
      where: { name: song.song },
      update: {
        timesPlayed: song.times_played,
        lastPlayed: song.last_played,
      },
      create: {
        name: song.song,
        timesPlayed: song.times_played,
        lastPlayed: song.last_played,
      },
    });
    upsertCount++;
  }

  return upsertCount;
}

/**
 * Fetch the setlist for a specific show date from Phish.net.
 * Returns an array of song names in order.
 */
export async function fetchSetlistByDate(showDate: string): Promise<string[]> {
  const url = `${config.phishNetBaseUrl}/setlists/showdate/${encodeURIComponent(showDate)}.json?apikey=${encodeURIComponent(config.phishNetApiKey)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Phish.net API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as PhishNetResponse<PhishNetSetlistEntry[]>;
  if (json.error_code !== 0) {
    throw new Error(`Phish.net API error: ${json.error_message}`);
  }

  if (!json.data || json.data.length === 0) {
    return [];
  }

  // Extract unique song names from all sets
  const songs = json.data.map((entry) => entry.song);
  return [...new Set(songs)];
}
