import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../auth-context';
import { apiClient } from '../api-client';
import { API_URL } from '../config';
import type { DraftState, Song } from '@phish-squares/shared';
import { SocketEvent } from '@phish-squares/shared';
import styles from './DraftPage.module.css';

export default function DraftPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef<Socket | null>(null);

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [writeInError, setWriteInError] = useState('');
  const [timer, setTimer] = useState(60);
  const [isMyTurn, setIsMyTurn] = useState(false);

  useEffect(() => {
    const socket = io(`${API_URL}/draft`, {
      auth: { token },
    });

    socket.on('connect', () => {
      socket.emit(SocketEvent.JOIN_DRAFT, id);
    });

    socket.on(SocketEvent.DRAFT_STATE, (state: DraftState) => {
      setDraftState(state);
      setIsMyTurn(state.currentPickerUserId === user?.id);
      setTimer(state.timerSeconds);
    });

    socket.on(SocketEvent.PICK_MADE, () => {
      setSearchQuery('');
      setSearchResults([]);
    });

    socket.on(SocketEvent.TIMER_TICK, (data: { seconds: number }) => {
      setTimer(data.seconds);
    });

    socket.on(SocketEvent.DRAFT_COMPLETE, () => {
      navigate(`/game/${id}/results`, { replace: true });
    });

    socket.on(SocketEvent.ERROR, (message: string) => {
      console.error('Draft error:', message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [id, token, user?.id, navigate]);

  // Build a set of picked song names (lowercase) for filtering
  const pickedSongNames = useMemo(
    () => new Set((draftState?.picks ?? []).map((p) => p.songName.trim().toLowerCase())),
    [draftState?.picks],
  );

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = (await apiClient.searchSongs(query, id)) as Song[];
      // Filter out songs already picked in this game
      setSearchResults(
        results.filter((s) => !pickedSongNames.has(s.name.trim().toLowerCase())),
      );
    } catch {
      // Ignore search errors
    }
  }, [id, pickedSongNames]);

  const handleMakePick = (songName: string) => {
    if (!socketRef.current || !isMyTurn) return;
    socketRef.current.emit(SocketEvent.MAKE_PICK, { gameId: id, songName });
    setSearchQuery('');
    setSearchResults([]);
    setWriteInError('');
  };

  const handleWriteIn = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setWriteInError('');

    // Block write-ins of already-picked songs
    if (pickedSongNames.has(trimmed.toLowerCase())) {
      setWriteInError('That song has already been picked in this game');
      return;
    }

    try {
      const song = await apiClient.addCustomSong(trimmed);
      handleMakePick(song.name);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        setWriteInError(err.message);
      } else {
        setWriteInError(err instanceof Error ? err.message : 'Failed to add song');
      }
    }
  };

  if (!draftState) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>Connecting to draft…</p>
      </div>
    );
  }

  const currentPicker = draftState.players.find(
    (p) => p.userId === draftState.currentPickerUserId,
  );

  return (
    <div className={styles.container}>
      {/* Turn Banner */}
      <div className={`${styles.turnBanner} ${isMyTurn ? styles.myTurnBanner : ''}`}>
        <p className={styles.turnText}>
          {isMyTurn ? '🎯 YOUR PICK!' : `${currentPicker?.user.username ?? '...'}'s turn`}
        </p>
        <div className={styles.timerContainer}>
          <p className={`${styles.timer} ${timer <= 10 ? styles.timerUrgent : ''}`}>
            {timer}s
          </p>
        </div>
      </div>

      {/* Round Info */}
      <div className={styles.roundInfo}>
        <p className={styles.roundText}>
          Round {draftState.currentRound}/{draftState.totalRounds}
          {draftState.currentRound === draftState.totalRounds ? ' (BONUS)' : ''}
        </p>
      </div>

      {/* Song Search (only when it's my turn) */}
      {isMyTurn && (
        <div className={styles.searchContainer}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search for a song…"
            value={searchQuery}
            onChange={(e) => void handleSearch(e.target.value)}
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className={styles.searchResults}>
              {searchResults.map((song) => (
                <button
                  key={song.id}
                  className={styles.songResult}
                  onClick={() => handleMakePick(song.name)}
                >
                  <span className={styles.songName}>{song.name}</span>
                  <span className={styles.songMeta}>Played {song.timesPlayed}x</span>
                </button>
              ))}
            </div>
          )}
          {searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className={styles.writeInContainer}>
              <p className={styles.writeInHint}>
                No matches found. Write in &ldquo;{searchQuery}&rdquo; as a custom song?
              </p>
              {writeInError && <p className={styles.writeInError}>{writeInError}</p>}
              <button className={styles.writeInButton} onClick={() => void handleWriteIn()}>
                Write In
              </button>
            </div>
          )}
        </div>
      )}

      {/* Draft Board */}
      <h2 className={styles.sectionTitle}>Draft Board</h2>
      <div className={styles.picksList}>
        {draftState.picks.length === 0 ? (
          <p className={styles.emptyText}>No picks yet — draft is starting!</p>
        ) : (
          draftState.picks.map((pick) => {
            const player = draftState.players.find((p) => p.userId === pick.userId);
            return (
              <div key={pick.id} className={styles.pickRow}>
                <div className={styles.pickRound}>
                  <span className={styles.pickRoundText}>R{pick.round}</span>
                </div>
                <span className={styles.pickPlayer}>{player?.user.username}</span>
                <span className={styles.pickSong}>{pick.songName}</span>
                {pick.isBonus && <span className={styles.bonusBadge}>★</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
