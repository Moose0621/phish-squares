import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PhishInSong {
  slug: string;
  title: string;
  alias: string | null;
  original: boolean;
  artist: string;
  tracks_count: number;
}

interface PhishInResponse {
  songs: PhishInSong[];
  total_pages: number;
  current_page: number;
  total_entries: number;
}

async function main() {
  console.log('Fetching songs from phish.in API...');

  const allSongs: PhishInSong[] = [];
  let page = 1;

  while (true) {
    const url = `https://phish.in/api/v2/songs?per_page=250&sort_attr=title&sort_dir=asc&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`phish.in API error: ${res.status}`);

    const json = (await res.json()) as PhishInResponse;
    allSongs.push(...json.songs);
    console.log(`  Page ${page}/${json.total_pages} (${json.songs.length} songs)`);

    if (page >= json.total_pages) break;
    page++;
  }

  console.log(`\nTotal fetched: ${allSongs.length} songs`);

  // Filter out aliases (null alias field means it's a real song, not an alias)
  const realSongs = allSongs.filter((s) => s.alias === null);
  console.log(`Real songs (excluding aliases): ${realSongs.length}`);

  let created = 0;
  let skipped = 0;

  for (const song of realSongs) {
    try {
      await prisma.song.upsert({
        where: { name: song.title },
        update: {
          artist: song.artist || '',
          timesPlayed: song.tracks_count,
        },
        create: {
          name: song.title,
          artist: song.artist || '',
          timesPlayed: song.tracks_count,
          isCustom: false,
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  console.log(`\nDone! Created/updated: ${created}, Skipped: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
