import OpenAI from 'openai';
import { config } from '../config';

/**
 * Parse song names from an image of a setlist using OpenAI Vision (gpt-4o).
 * Returns an array of song names extracted from the image.
 */
export async function parseSetlistImage(imageBuffer: Buffer, mimeType: string): Promise<string[]> {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  const base64Image = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are looking at a photo of a Phish concert setlist. Extract every song name from this image.

Rules:
- Return ONLY a JSON array of song name strings, e.g. ["Tweezer", "Fluffhead", "You Enjoy Myself"]
- Include songs from all sets (Set 1, Set 2, Encore, etc.)
- Use the standard/common Phish song title (e.g. "You Enjoy Myself" not "YEM")
- Do NOT include set labels, arrows, notes, or any non-song text
- If you cannot read a song name clearly, make your best guess based on known Phish songs
- Return valid JSON only, no markdown formatting`,
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('No response from vision model');
  }

  // Strip markdown code fences if present
  const jsonStr = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || !parsed.every((s: unknown) => typeof s === 'string')) {
      throw new Error('Invalid format');
    }
    return parsed as string[];
  } catch {
    throw new Error(`Failed to parse vision response as JSON: ${content.slice(0, 200)}`);
  }
}

/**
 * Fuzzy-match a song name against a list of known song names.
 * Returns the best match if similarity is above the threshold.
 */
export function fuzzyMatchSong(
  songName: string,
  knownSongs: string[],
  threshold = 0.85,
): string | null {
  const normalized = songName.trim().toLowerCase();

  // Exact match first
  const exact = knownSongs.find((s) => s.toLowerCase() === normalized);
  if (exact) return exact;

  // Fuzzy match using Levenshtein-based similarity
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const known of knownSongs) {
    const score = similarity(normalized, known.toLowerCase());
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = known;
    }
  }

  return bestMatch;
}

/** Levenshtein-based similarity ratio (0..1) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
