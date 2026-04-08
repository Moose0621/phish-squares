import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api-client';
import { useAuth } from '../auth-context';
import styles from './RunPage.module.css';

interface RunGame {
  id: string;
  showDate: string;
  showVenue: string;
  status: string;
  players: { user: { username: string } }[];
}

interface RunPlayerItem {
  userId: string;
  user: { id: string; username: string };
}

interface RunDetail {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  hostUserId: string;
  inviteCode: string;
  status: string;
  games: RunGame[];
  players: RunPlayerItem[];
}

interface Standing {
  userId: string;
  username: string;
  gameScores: { gameId: string; showDate: string; points: number }[];
  totalPoints: number;
  rank: number;
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

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editError, setEditError] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addError, setAddError] = useState('');
  const [managingGames, setManagingGames] = useState(false);

  const loadRun = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiClient.getRun(id) as RunDetail;
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run');
    }
  }, [id]);

  const loadStandings = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiClient.getRunStandings(id) as { standings: Standing[] };
      setStandings(data.standings);
    } catch {
      // Standings may not be available yet
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRun();
    void loadStandings();
  }, [loadRun, loadStandings]);

  const handleCopyCode = async () => {
    if (!run) return;
    await navigator.clipboard.writeText(run.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openEditModal = () => {
    if (!run) return;
    setEditName(run.name);
    setEditVenue(run.venue);
    setEditError('');
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!run || !id) return;
    setEditError('');
    try {
      const updated = await apiClient.updateRun(id, {
        name: editName.trim(),
        venue: editVenue.trim(),
      }) as RunDetail;
      setRun(updated);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update run');
    }
  };

  const handleRemoveGame = async (gameId: string) => {
    if (!run || !id) return;
    try {
      const updated = await apiClient.deleteRunGame(id, gameId) as RunDetail;
      setRun(updated);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to remove game');
    }
  };

  const handleAddGame = async () => {
    if (!run || !id || !addDate) return;
    setAddError('');
    try {
      const updated = await apiClient.addRunGame(id, addDate) as RunDetail;
      setRun(updated);
      setAddDate('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add game');
    }
  };

  const navigateToGame = (game: RunGame) => {
    if (game.status === 'LOBBY') {
      navigate(`/game/${game.id}/lobby`);
    } else if (game.status === 'DRAFTING') {
      navigate(`/game/${game.id}/draft`);
    } else {
      navigate(`/game/${game.id}/results`);
    }
  };

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>{error}</p>
      </div>
    );
  }

  if (!run) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>Loading run…</p>
      </div>
    );
  }

  const isHost = user?.id === run.hostUserId;
  const scoredGames = run.games.filter((g) => g.status === 'SCORED');

  return (
    <div className={styles.container}>
      <Link to="/" className={styles.backLink}>← Back to Home</Link>

      <div className={styles.header}>
        <h1 className={styles.runName}>{run.name}</h1>
        <p className={styles.venue}>{run.venue}</p>
        <p className={styles.dates}>
          {run.startDate.split('T')[0]} — {run.endDate.split('T')[0]}
        </p>
        <span className={styles.statusBadge} style={{ color: getStatusColor(run.status) }}>
          {run.status}
        </span>
        <div className={styles.inviteCodeRow}>
          <span className={styles.inviteCode}>{run.inviteCode}</span>
          <button className={styles.copyBtn} onClick={() => void handleCopyCode()}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        {isHost && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button className={styles.editBtn} onClick={openEditModal}>Edit Details</button>
            <button
              className={styles.editBtn}
              onClick={() => setManagingGames(!managingGames)}
            >
              {managingGames ? 'Done Managing' : 'Manage Games'}
            </button>
          </div>
        )}
      </div>

      <h2 className={styles.sectionTitle}>Games ({run.games.length} nights)</h2>
      <div className={styles.gamesList}>
        {run.games.map((game) => (
          <div
            key={game.id}
            className={styles.gameCard}
            style={{ cursor: managingGames ? 'default' : 'pointer' }}
            onClick={() => !managingGames && navigateToGame(game)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && !managingGames && navigateToGame(game)}
          >
            <span className={styles.gameDate}>{game.showDate.split('T')[0]}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={styles.gameStatus} style={{ color: getStatusColor(game.status) }}>
                {game.status}
              </span>
              {managingGames && isHost && game.status === 'LOBBY' && run.games.length > 1 && (
                <button
                  className={styles.removeGameBtn}
                  onClick={(e) => { e.stopPropagation(); void handleRemoveGame(game.id); }}
                  title="Remove this game"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {managingGames && isHost && (
        <>
          {addError && <p className={styles.error}>{addError}</p>}
          <div className={styles.addGameRow}>
            <input
              className={styles.addGameInput}
              type="date"
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
            />
            <button className={styles.addGameBtn} onClick={() => void handleAddGame()}>
              + Add Show Date
            </button>
          </div>
        </>
      )}

      {(standings.length > 0 || scoredGames.length > 0) && (
        <>
          <h2 className={styles.sectionTitle}>Cumulative Standings</h2>
          <table className={styles.standingsTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                {standings[0]?.gameScores.map((gs) => (
                  <th key={gs.gameId}>{gs.showDate}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.userId}>
                  <td className={styles.rank}>{s.rank}</td>
                  <td>{s.username}</td>
                  {s.gameScores.map((gs) => (
                    <td key={gs.gameId} style={{ textAlign: 'center' }}>{gs.points}</td>
                  ))}
                  <td className={styles.totalPoints}>{s.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className={styles.sectionTitle}>Players ({run.players.length})</h2>
      <div>
        {run.players.map((p) => (
          <span key={p.userId} style={{ display: 'inline-block', marginRight: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
            {p.user.username}{p.userId === run.hostUserId ? ' 👑' : ''}
          </span>
        ))}
      </div>

      {isHost && (
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 24, textAlign: 'center' }}>
          You are the host of this run.
        </p>
      )}

      {/* Edit Run Modal */}
      {editing && (
        <div className={styles.editOverlay} onClick={() => setEditing(false)}>
          <div className={styles.editModal} onClick={(e) => e.stopPropagation()}>
            <h2>Edit Run</h2>
            {editError && <p className={styles.error}>{editError}</p>}
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Name</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Run Name"
            />
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Venue</label>
            <input
              value={editVenue}
              onChange={(e) => setEditVenue(e.target.value)}
              placeholder="Venue"
            />
            <div className={styles.editModalActions}>
              <button className={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={() => void handleSaveEdit()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
