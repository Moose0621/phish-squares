import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { apiClient } from '../api-client';
import styles from './ProfilePage.module.css';

interface Stats {
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
  lastPlayedAt: string | null;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiClient.getMyStats() as Stats;
      setStats(data);
    } catch {
      // Stats may not exist yet
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats();
  }, [loadStats]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const winRate = stats && stats.gamesPlayed > 0
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
    : 0;

  const accuracy = stats && stats.totalPicks > 0
    ? Math.round((stats.correctPicks / stats.totalPicks) * 100)
    : 0;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <span className={styles.avatar}>🎸</span>
        <p className={styles.username}>{user?.username}</p>
      </div>

      {stats && stats.gamesPlayed > 0 && (
        <div className={styles.statsSection}>
          <h2 className={styles.sectionTitle}>Career Stats</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.gamesPlayed}</span>
              <span className={styles.statLabel}>Games Played</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{winRate}%</span>
              <span className={styles.statLabel}>Win Rate</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{accuracy}%</span>
              <span className={styles.statLabel}>Accuracy</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.totalPoints}</span>
              <span className={styles.statLabel}>Total Points</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.bestGamePoints}</span>
              <span className={styles.statLabel}>Best Game</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.currentStreak > 0 ? `🔥 ${stats.currentStreak}` : '—'}</span>
              <span className={styles.statLabel}>Current Streak</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.longestStreak}</span>
              <span className={styles.statLabel}>Longest Streak</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.gamesWon}</span>
              <span className={styles.statLabel}>Wins</span>
            </div>
          </div>

          {stats.runsParticipated > 0 && (
            <>
              <h2 className={styles.sectionTitle}>Run Stats</h2>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.runsParticipated}</span>
                  <span className={styles.statLabel}>Runs Joined</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{stats.runsWon}</span>
                  <span className={styles.statLabel}>Runs Won</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <button className={styles.logoutButton} onClick={() => void handleLogout()}>
        Sign Out
      </button>
    </div>
  );
}
