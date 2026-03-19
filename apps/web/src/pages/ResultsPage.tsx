import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api-client';
import { useAuth } from '../auth-context';
import type { GameResult, PlayerResult } from '@phish-squares/shared';
import styles from './ResultsPage.module.css';

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [game, setGame] = useState<GameResult | null>(null);
  const [error, setError] = useState('');

  // Setlist upload state
  const [parsedSongs, setParsedSongs] = useState<string[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const isScored = game.status === 'SCORED';
  const isHost = user?.id === game.hostUserId;
  const canUploadSetlist = isHost && game.status === 'LOCKED';

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    setUploading(true);
    setUploadError('');
    setParsedSongs(null);
    try {
      const result = await apiClient.uploadSetlistImage(id, file);
      setParsedSongs(result.songs);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse image');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmScore = async () => {
    if (!parsedSongs || !id) return;
    setScoring(true);
    setUploadError('');
    try {
      await apiClient.scoreGameWithSetlist(id, parsedSongs);
      // Reload results to get scored state
      const data = (await apiClient.getGameResults(id)) as GameResult;
      setGame(data);
      setParsedSongs(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to score game');
    } finally {
      setScoring(false);
    }
  };

  const handleRemoveSong = (index: number) => {
    if (!parsedSongs) return;
    setParsedSongs(parsedSongs.filter((_, i) => i !== index));
  };

  const handleAddSong = () => {
    const name = prompt('Enter song name:');
    if (name?.trim() && parsedSongs) {
      setParsedSongs([...parsedSongs, name.trim()]);
    }
  };

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

      {/* Setlist upload for host when game is LOCKED */}
      {canUploadSetlist && !parsedSongs && (
        <div className={styles.uploadSection}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <button
            className={styles.uploadButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Parsing setlist…' : '📸 Upload Setlist Photo'}
          </button>
          {uploadError && <p className={styles.errorText}>{uploadError}</p>}
        </div>
      )}

      {/* Parsed setlist review */}
      {parsedSongs && (
        <div className={styles.uploadSection}>
          <h2 className={styles.sectionTitle}>Review Parsed Setlist</h2>
          <p className={styles.reviewHint}>Remove incorrect songs or add missing ones before scoring.</p>
          <div className={styles.parsedList}>
            {parsedSongs.map((song, i) => (
              <span key={i} className={styles.parsedSong}>
                {song}
                <button
                  className={styles.removeSongBtn}
                  onClick={() => handleRemoveSong(i)}
                  aria-label={`Remove ${song} from parsed setlist`}
                >
                  ×
                </button>
              </span>
            ))}
            <button className={styles.addSongBtn} onClick={handleAddSong}>+ Add Song</button>
          </div>
          <div className={styles.scoreActions}>
            <button
              className={styles.confirmScoreBtn}
              onClick={handleConfirmScore}
              disabled={scoring || parsedSongs.length === 0}
            >
              {scoring ? 'Scoring…' : `✅ Score Game (${parsedSongs.length} songs)`}
            </button>
            <button className={styles.cancelBtn} onClick={() => setParsedSongs(null)}>
              Cancel
            </button>
          </div>
          {uploadError && <p className={styles.errorText}>{uploadError}</p>}
        </div>
      )}

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
