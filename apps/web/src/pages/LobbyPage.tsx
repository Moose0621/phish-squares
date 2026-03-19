import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { apiClient } from '../api-client';
import styles from './LobbyPage.module.css';

interface GameDetail {
  id: string;
  hostUserId: string;
  showDate: string;
  showVenue: string;
  status: string;
  inviteCode: string;
  maxPlayers: number;
  players: { userId: string; user: { id: string; username: string } }[];
}

export default function LobbyPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState('');

  const loadGame = useCallback(async () => {
    if (!id) return;
    try {
      const data = (await apiClient.getGame(id)) as GameDetail;
      setGame(data);
      if (data.status === 'DRAFTING') {
        navigate(`/game/${id}/draft`, { replace: true });
      }
    } catch {
      setError('Failed to load game');
    }
  }, [id, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGame();
    const interval = setInterval(() => void loadGame(), 5000);
    return () => clearInterval(interval);
  }, [loadGame]);

  const handleStartDraft = async () => {
    if (!id) return;
    try {
      await apiClient.startGame(id);
      navigate(`/game/${id}/draft`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
    }
  };

  const handleCopyCode = () => {
    if (!game) return;
    void navigator.clipboard.writeText(game.inviteCode).catch(() => {
      // fallback: do nothing if clipboard not available
    });
  };

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
        <p className={styles.loadingText}>Loading…</p>
      </div>
    );
  }

  const isHost = user?.id === game.hostUserId;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.venue}>{game.showVenue}</h1>
        <p className={styles.date}>{game.showDate.split('T')[0]}</p>
      </div>

      <div className={styles.codeCard} onClick={handleCopyCode} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCopyCode()}>
        <p className={styles.codeLabel}>Invite Code</p>
        <p className={styles.codeValue}>{game.inviteCode}</p>
        <p className={styles.codeTap}>Click to copy</p>
      </div>

      <h2 className={styles.sectionTitle}>
        Players ({game.players.length}/{game.maxPlayers})
      </h2>

      <ul className={styles.playerList}>
        {game.players.map((player, index) => (
          <li key={player.userId} className={styles.playerRow}>
            <span className={styles.playerNumber}>{index + 1}</span>
            <span className={styles.playerName}>{player.user.username}</span>
            {player.userId === game.hostUserId && (
              <span className={styles.hostBadge}>HOST</span>
            )}
          </li>
        ))}
      </ul>

      {isHost ? (
        <button
          className={styles.startButton}
          onClick={() => void handleStartDraft()}
          disabled={game.players.length < 2}
        >
          Start Draft
        </button>
      ) : (
        <div className={styles.waitingBanner}>
          <p className={styles.waitingText}>Waiting for host to start the draft…</p>
        </div>
      )}
    </div>
  );
}
