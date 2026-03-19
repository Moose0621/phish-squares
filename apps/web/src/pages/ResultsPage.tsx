import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api-client';
import type { GameResult, PlayerResult } from '@phish-squares/shared';
import styles from './ResultsPage.module.css';

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<GameResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const data = (await apiClient.getGameResults(id)) as GameResult;
        setGame(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      }
    };
    void load();
  }, [id]);

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>{error}</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>Loading results…</p>
      </div>
    );
  }

  const sorted = [...game.playerResults].sort((a, b) => b.totalPoints - a.totalPoints);
  const isScored = sorted.some((p) => p.totalPoints > 0);

  // Build round numbers from picks
  const allRounds = new Set<number>();
  for (const player of sorted) {
    for (const pick of player.picks) {
      allRounds.add(pick.round);
    }
  }
  const rounds = [...allRounds].sort((a, b) => a - b);

  // Build a lookup: { [userId]: { [round]: pick } }
  const pickGrid = new Map<string, Map<number, { songName: string; isBonus: boolean; scored: boolean }>>();
  for (const player of sorted) {
    const roundMap = new Map<number, { songName: string; isBonus: boolean; scored: boolean }>();
    for (const pick of player.picks) {
      roundMap.set(pick.round, { songName: pick.songName, isBonus: pick.isBonus, scored: pick.scored });
    }
    pickGrid.set(player.userId, roundMap);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.venue}>{game.showVenue}</h1>
        <p className={styles.date}>{game.showDate}</p>
      </div>

      {game.setlist.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Setlist</h2>
          <div className={styles.setlistList}>
            {game.setlist.map((song, i) => (
              <span key={i} className={styles.setlistSong}>{song}</span>
            ))}
          </div>
        </>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.playerHeader}>Player</th>
              {rounds.map((round) => {
                const isBonus = sorted[0]?.picks.find((p) => p.round === round)?.isBonus;
                return (
                  <th key={round} className={`${styles.roundHeader} ${isBonus ? styles.bonusHeader : ''}`}>
                    {isBonus ? '★' : round}
                  </th>
                );
              })}
              {isScored && <th className={styles.roundHeader}>Total</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((player: PlayerResult) => (
              <tr key={player.userId}>
                <td className={styles.playerCell}>
                  <span className={styles.playerName}>{player.username}</span>
                </td>
                {rounds.map((round) => {
                  const pick = pickGrid.get(player.userId)?.get(round);
                  if (!pick) return <td key={round} className={styles.pickCell}>—</td>;
                  return (
                    <td
                      key={round}
                      className={`${styles.pickCell} ${isScored && pick.scored ? styles.correctCell : ''}`}
                    >
                      <span className={styles.songName}>{pick.songName}</span>
                      {isScored && (
                        <span className={styles.statusIcon}>{pick.scored ? '✅' : '❌'}</span>
                      )}
                    </td>
                  );
                })}
                {isScored && (
                  <td className={styles.totalCell}>{player.totalPoints}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
