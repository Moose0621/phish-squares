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
      </div>

      <h2 className={styles.sectionTitle}>Games ({run.games.length} nights)</h2>
      <div className={styles.gamesList}>
        {run.games.map((game) => (
          <div
            key={game.id}
            className={styles.gameCard}
            onClick={() => navigateToGame(game)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigateToGame(game)}
          >
            <span className={styles.gameDate}>{game.showDate.split('T')[0]}</span>
            <span className={styles.gameStatus} style={{ color: getStatusColor(game.status) }}>
              {game.status}
            </span>
          </div>
        ))}
      </div>

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
    </div>
  );
}
