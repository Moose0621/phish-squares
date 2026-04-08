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

interface RunItem {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  status: string;
  inviteCode: string;
  players: { user: { username: string } }[];
  games: { id: string }[];
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'LOBBY': case 'UPCOMING': return '#f6e05e';
    case 'DRAFTING': case 'ACTIVE': return '#48bb78';
    case 'LOCKED': return '#ed8936';
    case 'SCORED': case 'COMPLETED': return '#e94560';
    default: return '#888';
  }
}

type Tab = 'games' | 'runs';

export default function HomePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('games');
  const [games, setGames] = useState<GameItem[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateRunModal, setShowCreateRunModal] = useState(false);
  const [showJoinRunModal, setShowJoinRunModal] = useState(false);
  const [showDate, setShowDate] = useState('');
  const [showVenue, setShowVenue] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');

  // Run form state
  const [runName, setRunName] = useState('');
  const [runVenue, setRunVenue] = useState('');
  const [runStartDate, setRunStartDate] = useState('');
  const [runEndDate, setRunEndDate] = useState('');
  const [runInviteCode, setRunInviteCode] = useState('');
  const [createRunError, setCreateRunError] = useState('');
  const [joinRunError, setJoinRunError] = useState('');

  const loadGames = useCallback(async () => {
    try {
      const data = await apiClient.getGames();
      setGames(data as GameItem[]);
    } catch (err) {
      console.error('Failed to load games:', err);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const data = await apiClient.getRuns();
      setRuns(data as RunItem[]);
    } catch (err) {
      console.error('Failed to load runs:', err);
    }
  }, []);

  useEffect(() => {
    if (token) {
      apiClient.setToken(token);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadGames();
      void loadRuns();
    }
  }, [token, loadGames, loadRuns]);

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

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runName.trim() || !runVenue.trim() || !runStartDate.trim() || !runEndDate.trim()) {
      setCreateRunError('Please fill in all fields');
      return;
    }
    setCreateRunError('');
    try {
      const run = (await apiClient.createRun({
        name: runName.trim(),
        venue: runVenue.trim(),
        startDate: runStartDate.trim(),
        endDate: runEndDate.trim(),
      })) as RunItem;
      setShowCreateRunModal(false);
      setRunName('');
      setRunVenue('');
      setRunStartDate('');
      setRunEndDate('');
      navigate(`/run/${run.id}`);
    } catch (err) {
      setCreateRunError(err instanceof Error ? err.message : 'Failed to create run');
    }
  };

  const handleJoinRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runInviteCode.trim()) {
      setJoinRunError('Please enter an invite code');
      return;
    }
    setJoinRunError('');
    try {
      const run = (await apiClient.joinRun(runInviteCode.trim().toUpperCase())) as RunItem;
      setShowJoinRunModal(false);
      setRunInviteCode('');
      navigate(`/run/${run.id}`);
    } catch (err) {
      setJoinRunError(err instanceof Error ? err.message : 'Failed to join run');
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
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'games' ? styles.tabActive : ''}`}
          onClick={() => setTab('games')}
        >
          Games
        </button>
        <button
          className={`${styles.tab} ${tab === 'runs' ? styles.tabActive : ''}`}
          onClick={() => setTab('runs')}
        >
          Runs
        </button>
      </div>

      {tab === 'games' && (
        <>
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
        </>
      )}

      {tab === 'runs' && (
        <>
          <div className={styles.actions}>
            <button className={styles.actionButton} onClick={() => setShowCreateRunModal(true)}>
              + New Run
            </button>
            <button
              className={`${styles.actionButton} ${styles.joinButton}`}
              onClick={() => setShowJoinRunModal(true)}
            >
              Join Run
            </button>
          </div>

          <div className={styles.list}>
            {runs.length === 0 ? (
              <p className={styles.emptyText}>
                No runs yet. Create one for a multi-show event!
              </p>
            ) : (
              runs.map((run) => (
                <div
                  key={run.id}
                  className={styles.gameCard}
                  onClick={() => navigate(`/run/${run.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/run/${run.id}`)}
                >
                  <div className={styles.gameHeader}>
                    <span className={styles.gameVenue}>{run.name}</span>
                    <span
                      className={styles.gameStatus}
                      style={{ color: getStatusColor(run.status) }}
                    >
                      {run.status}
                    </span>
                  </div>
                  <p className={styles.gameDate}>
                    {run.venue} · {run.startDate.split('T')[0]} — {run.endDate.split('T')[0]}
                  </p>
                  <p className={styles.gamePlayers}>
                    {run.players.length} player{run.players.length !== 1 ? 's' : ''} · {run.games.length} night{run.games.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Create Game Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create New Game</h2>
            {createError && <p className={styles.error}>{createError}</p>}
            <form onSubmit={handleCreateGame}>
              <input
                className={styles.input}
                type="date"
                placeholder="Show Date"
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

      {/* Create Run Modal */}
      {showCreateRunModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateRunModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Create New Run</h2>
            {createRunError && <p className={styles.error}>{createRunError}</p>}
            <form onSubmit={handleCreateRun}>
              <input
                className={styles.input}
                type="text"
                placeholder="Run Name (e.g., MSG NYE Run 2026)"
                value={runName}
                onChange={(e) => setRunName(e.target.value)}
              />
              <input
                className={styles.input}
                type="text"
                placeholder="Venue"
                value={runVenue}
                onChange={(e) => setRunVenue(e.target.value)}
              />
              <input
                className={styles.input}
                type="date"
                placeholder="Start Date"
                value={runStartDate}
                onChange={(e) => setRunStartDate(e.target.value)}
              />
              <input
                className={styles.input}
                type="date"
                placeholder="End Date"
                value={runEndDate}
                onChange={(e) => setRunEndDate(e.target.value)}
              />
              <button className={styles.modalButton} type="submit">
                Create Run
              </button>
            </form>
            <button className={styles.cancelText} onClick={() => setShowCreateRunModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Join Run Modal */}
      {showJoinRunModal && (
        <div className={styles.modalOverlay} onClick={() => setShowJoinRunModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Join Run</h2>
            {joinRunError && <p className={styles.error}>{joinRunError}</p>}
            <form onSubmit={handleJoinRun}>
              <input
                className={styles.input}
                type="text"
                placeholder="Run Invite Code"
                value={runInviteCode}
                onChange={(e) => setRunInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '4px', fontFamily: 'monospace' }}
              />
              <button className={styles.modalButton} type="submit">
                Join
              </button>
            </form>
            <button className={styles.cancelText} onClick={() => setShowJoinRunModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
