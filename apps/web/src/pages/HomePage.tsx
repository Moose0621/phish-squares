import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import { apiClient } from '../api-client';
import styles from './HomePage.module.css';

interface GameItem {
  id: string;
  showDate: string;
  showVenue: string;
  status: string;
  inviteCode: string;
  players: { user: { username: string } }[];
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'LOBBY': return '#f6e05e';
    case 'DRAFTING': return '#48bb78';
    case 'LOCKED': return '#ed8936';
    case 'SCORED': return '#e94560';
    default: return '#888';
  }
}

export default function HomePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<GameItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showDate, setShowDate] = useState('');
  const [showVenue, setShowVenue] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');

  const loadGames = useCallback(async () => {
    try {
      const data = await apiClient.getGames();
      setGames(data as GameItem[]);
    } catch (err) {
      console.error('Failed to load games:', err);
    }
  }, []);

  useEffect(() => {
    if (token) {
      apiClient.setToken(token);
      void loadGames();
    }
  }, [token, loadGames]);

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDate.trim() || !showVenue.trim()) {
      setCreateError('Please fill in all fields');
      return;
    }
    setCreateError('');
    try {
      const game = (await apiClient.createGame({
        showDate: showDate.trim(),
        showVenue: showVenue.trim(),
      })) as GameItem;
      setShowCreateModal(false);
      setShowDate('');
      setShowVenue('');
      navigate(`/game/${game.id}/lobby`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create game');
    }
  };

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setJoinError('Please enter an invite code');
      return;
    }
    setJoinError('');
    try {
      const game = (await apiClient.joinGame(inviteCode.trim().toUpperCase())) as GameItem;
      setShowJoinModal(false);
      setInviteCode('');
      navigate(`/game/${game.id}/lobby`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join game');
    }
  };

  const navigateToGame = (game: GameItem) => {
    if (game.status === 'LOBBY') {
      navigate(`/game/${game.id}/lobby`);
    } else if (game.status === 'DRAFTING') {
      navigate(`/game/${game.id}/draft`);
    } else {
      navigate(`/game/${game.id}/results`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.actions}>
        <button className={styles.actionButton} onClick={() => setShowCreateModal(true)}>
          + New Game
        </button>
        <button
          className={`${styles.actionButton} ${styles.joinButton}`}
          onClick={() => setShowJoinModal(true)}
        >
          Join Game
        </button>
      </div>

      <div className={styles.list}>
        {games.length === 0 ? (
          <p className={styles.emptyText}>
            No games yet. Create one or join with an invite code!
          </p>
        ) : (
          games.map((game) => (
            <div
              key={game.id}
              className={styles.gameCard}
              onClick={() => navigateToGame(game)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigateToGame(game)}
            >
              <div className={styles.gameHeader}>
                <span className={styles.gameVenue}>{game.showVenue}</span>
                <span
                  className={styles.gameStatus}
                  style={{ color: getStatusColor(game.status) }}
                >
                  {game.status}
                </span>
              </div>
              <p className={styles.gameDate}>{game.showDate.split('T')[0]}</p>
              <p className={styles.gamePlayers}>
                {game.players.length} player{game.players.length !== 1 ? 's' : ''}
              </p>
              {game.status === 'LOBBY' && (
                <p className={styles.inviteCode}>Code: {game.inviteCode}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Game Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create New Game</h2>
            {createError && <p className={styles.error}>{createError}</p>}
            <form onSubmit={handleCreateGame}>
              <input
                className={styles.input}
                type="text"
                placeholder="Show Date (YYYY-MM-DD)"
                value={showDate}
                onChange={(e) => setShowDate(e.target.value)}
              />
              <input
                className={styles.input}
                type="text"
                placeholder="Venue"
                value={showVenue}
                onChange={(e) => setShowVenue(e.target.value)}
              />
              <button className={styles.modalButton} type="submit">
                Create
              </button>
            </form>
            <button className={styles.cancelText} onClick={() => setShowCreateModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Join Game Modal */}
      {showJoinModal && (
        <div className={styles.modalOverlay} onClick={() => setShowJoinModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Join Game</h2>
            {joinError && <p className={styles.error}>{joinError}</p>}
            <form onSubmit={handleJoinGame}>
              <input
                className={styles.input}
                type="text"
                placeholder="Invite Code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '4px', fontFamily: 'monospace' }}
              />
              <button className={styles.modalButton} type="submit">
                Join
              </button>
            </form>
            <button className={styles.cancelText} onClick={() => setShowJoinModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
