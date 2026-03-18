import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api-client';
import styles from './ResultsPage.module.css';

interface PickResult {
  id: string;
  userId: string;
  songName: string;
  round: number;
  isBonus: boolean;
  scored: boolean | null;
  user?: { username: string };
}

interface GameResult {
  id: string;
  showDate: string;
  showVenue: string;
  status: string;
  players: { userId: string; user: { id: string; username: string } }[];
  picks: PickResult[];
}

interface PlayerScore {
  userId: string;
  username: string;
  correct: number;
  total: number;
  picks: PickResult[];
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<GameResult | null>(null);
  const [standings, setStandings] = useState<PlayerScore[]>([]);

  const loadResults = async () => {
    if (!id) return;
    try {
      const data = (await apiClient.getGameResults(id)) as GameResult;
      setGame(data);

      const playerScores = new Map<string, PlayerScore>();
      for (const player of data.players) {
        playerScores.set(player.userId, {
          userId: player.userId,
          username: player.user.username,
          correct: 0,
          total: 0,
          picks: [],
        });
      }

      for (const pick of data.picks) {
        const ps = playerScores.get(pick.userId);
        if (ps) {
          ps.picks.push(pick);
          if (pick.scored) {
            ps.correct++;
            ps.total += pick.isBonus ? 2 : 1;
          }
        }
      }

      const sorted = [...playerScores.values()].sort((a, b) => b.total - a.total);
      setStandings(sorted);
    } catch (err) {
      console.error('Failed to load results:', err);
    }
  };

  useEffect(() => {
    void loadResults();
    // loadResults is stable (no deps outside id, which is in the effect deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!game) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>Loading results…</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.venue}>{game.showVenue}</h1>
        <p className={styles.date}>{game.showDate.split('T')[0]}</p>
      </div>

      <h2 className={styles.sectionTitle}>Standings</h2>
      <ul className={styles.standingsList}>
        {standings.map((standing, index) => (
          <li key={standing.userId} className={styles.standingRow}>
            <span className={`${styles.rank} ${index === 0 ? styles.firstPlace : ''}`}>
              {index === 0 ? '🏆' : `#${index + 1}`}
            </span>
            <span className={styles.playerName}>{standing.username}</span>
            <div className={styles.scoreContainer}>
              <span className={styles.score}>{standing.total} pts</span>
              <span className={styles.correctCount}>{standing.correct} correct</span>
            </div>
          </li>
        ))}
      </ul>

      <h2 className={styles.sectionTitle}>All Picks</h2>
      {game.picks.map((pick) => {
        const player = game.players.find((p) => p.userId === pick.userId);
        return (
          <div
            key={pick.id}
            className={`${styles.pickRow} ${pick.scored ? styles.correctPick : ''}`}
          >
            <div className={styles.pickInfo}>
              <span className={styles.pickPlayer}>{player?.user.username}</span>
              <span className={styles.pickSong}>{pick.songName}</span>
            </div>
            <div className={styles.pickStatus}>
              {pick.scored === true && <span className={styles.checkmark}>✅</span>}
              {pick.scored === false && <span className={styles.cross}>❌</span>}
              {pick.isBonus && <span className={styles.bonusBadge}>★ 2x</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
