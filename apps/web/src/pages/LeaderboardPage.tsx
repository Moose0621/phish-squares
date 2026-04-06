import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api-client';
import styles from './LeaderboardPage.module.css';

interface LeaderboardEntry {
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

type SortOption = 'points' | 'wins' | 'accuracy' | 'streak';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [sort, setSort] = useState<SortOption>('points');
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getLeaderboard(sort) as LeaderboardEntry[];
      setEntries(data);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'points', label: 'Points' },
    { value: 'wins', label: 'Wins' },
    { value: 'accuracy', label: 'Accuracy' },
    { value: 'streak', label: 'Streak' },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>🏆 Leaderboard</h1>

      <div className={styles.sortRow}>
        {sortOptions.map((opt) => (
          <button
            key={opt.value}
            className={`${styles.sortBtn} ${sort === opt.value ? styles.sortBtnActive : ''}`}
            onClick={() => setSort(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.loadingText}>Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.emptyText}>No stats yet. Play some games!</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Games</th>
                <th>Wins</th>
                <th>Win %</th>
                <th>Accuracy</th>
                <th>Points</th>
                <th>Streak</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.userId}>
                  <td className={styles.rank}>{entry.rank}</td>
                  <td>{entry.username}</td>
                  <td>{entry.gamesPlayed}</td>
                  <td>{entry.gamesWon}</td>
                  <td>{entry.winRate}%</td>
                  <td>{entry.accuracy}%</td>
                  <td className={styles.points}>{entry.totalPoints}</td>
                  <td>{entry.currentStreak > 0 ? `🔥 ${entry.currentStreak}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
