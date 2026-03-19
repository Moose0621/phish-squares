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
              <th className={styles.roundHeader}>Round</th>
              {sorted.map((player: PlayerResult) => (
                <th key={player.userId} className={styles.playerHeader}>
                  <span className={styles.playerName}>{player.username}</span>
                  {isScored && (
                    <span className={styles.playerScore}>{player.totalPoints} pts</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((round) => {
              const isBonus = sorted[0]?.picks.find((p) => p.round === round)?.isBonus;
              return (
                <tr key={round} className={isBonus ? styles.bonusRow : ''}>
                  <td className={styles.roundCell}>
                    {round}
                    {isBonus && <span className={styles.bonusLabel}>★</span>}
                  </td>
                  {sorted.map((player: PlayerResult) => {
                    const pick = pickGrid.get(player.userId)?.get(round);
                    if (!pick) return <td key={player.userId} className={styles.pickCell}>—</td>;
                    return (
                      <td
                        key={player.userId}
                        className={`${styles.pickCell} ${isScored && pick.scored ? styles.correctCell : ''} ${isScored && !pick.scored ? styles.missCell : ''}`}
                      >
                        <span className={styles.songName}>{pick.songName}</span>
                        {isScored && (
                          <span className={styles.statusIcon}>{pick.scored ? '✅' : '❌'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {isScored && (
            <tfoot>
              <tr>
                <td className={styles.roundCell}>Total</td>
                {sorted.map((player: PlayerResult) => (
                  <td key={player.userId} className={styles.totalCell}>
                    {player.totalPoints} pts
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
