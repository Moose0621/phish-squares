import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../auth-context';
import { apiClient } from '../../api-client';
import { API_URL } from '../../config';
import type { DraftState, Song, SocketEvent } from '@phish-squares/shared';

export default function DraftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, token } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Song[]>([]);
  const [timer, setTimer] = useState(60);
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Connect to Socket.io
  useEffect(() => {
    const socket = io(`${API_URL}/draft`, {
      auth: { token },
    });

    socket.on('connect', () => {
      socket.emit('join-draft', id);
    });

    socket.on('draft-state', (state: DraftState) => {
      setDraftState(state);
      setIsMyTurn(state.currentPickerUserId === user?.id);
      setTimer(state.timerSeconds);
    });

    socket.on('pick-made', () => {
      setSearchQuery('');
      setSearchResults([]);
    });

    socket.on('timer-tick', (data: { seconds: number }) => {
      setTimer(data.seconds);
    });

    socket.on('draft-complete', () => {
      router.replace(`/game/${id}/results`);
    });

    socket.on('error', (message: string) => {
      Alert.alert('Error', message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [id, token, user?.id]);

  // Song search
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = (await apiClient.searchSongs(query)) as Song[];
      setSearchResults(results);
    } catch {
      // Ignore search errors
    }
  }, []);

  const handleMakePick = (songName: string) => {
    if (!socketRef.current || !isMyTurn) return;
    socketRef.current.emit('make-pick', { gameId: id, songName });
    setSearchQuery('');
    setSearchResults([]);
  };

  if (!draftState) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Connecting to draft...</Text>
      </View>
    );
  }

  const currentPicker = draftState.players.find(
    (p) => p.userId === draftState.currentPickerUserId
  );

  return (
    <View style={styles.container}>
      {/* Current Turn Banner */}
      <View style={[styles.turnBanner, isMyTurn && styles.myTurnBanner]}>
        <Text style={styles.turnText}>
          {isMyTurn ? '🎯 YOUR PICK!' : `${currentPicker?.user.username}'s turn`}
        </Text>
        <View style={styles.timerContainer}>
          <Text style={[styles.timer, timer <= 10 && styles.timerUrgent]}>{timer}s</Text>
        </View>
      </View>

      {/* Round Info */}
      <View style={styles.roundInfo}>
        <Text style={styles.roundText}>
          Round {draftState.currentRound}/{draftState.totalRounds}
          {draftState.currentRound === draftState.totalRounds ? ' (BONUS)' : ''}
        </Text>
      </View>

      {/* Song Search (only when it's my turn) */}
      {isMyTurn && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a song..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
          />
          {searchResults.length > 0 && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              style={styles.searchResults}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.songResult}
                  onPress={() => handleMakePick(item.name)}
                >
                  <Text style={styles.songName}>{item.name}</Text>
                  <Text style={styles.songMeta}>Played {item.timesPlayed}x</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Draft Board */}
      <Text style={styles.sectionTitle}>Draft Board</Text>
      <FlatList
        data={draftState.picks}
        keyExtractor={(item) => item.id}
        style={styles.picksList}
        renderItem={({ item }) => {
          const player = draftState.players.find((p) => p.userId === item.userId);
          return (
            <View style={styles.pickRow}>
              <View style={styles.pickRound}>
                <Text style={styles.pickRoundText}>R{item.round}</Text>
              </View>
              <Text style={styles.pickPlayer}>{player?.user.username}</Text>
              <Text style={styles.pickSong}>{item.songName}</Text>
              {item.isBonus && <Text style={styles.bonusBadge}>★</Text>}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No picks yet — draft is starting!</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  loadingText: { color: '#a0aec0', textAlign: 'center', marginTop: 48 },
  turnBanner: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  myTurnBanner: {
    backgroundColor: '#2d3748',
    borderBottomWidth: 3,
    borderBottomColor: '#e94560',
  },
  turnText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  timerContainer: {
    backgroundColor: '#0f3460',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  timer: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  timerUrgent: { color: '#e94560' },
  roundInfo: { padding: 12, alignItems: 'center' },
  roundText: { fontSize: 14, color: '#a0aec0', fontWeight: 'bold' },
  searchContainer: { paddingHorizontal: 16, maxHeight: 260 },
  searchInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 2,
    borderColor: '#e94560',
  },
  searchResults: { maxHeight: 200, backgroundColor: '#1a1a2e', borderRadius: 8, marginTop: 4 },
  songResult: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d3748',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  songName: { fontSize: 16, color: '#fff' },
  songMeta: { fontSize: 12, color: '#a0aec0' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', padding: 16, paddingBottom: 8 },
  picksList: { flex: 1 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  pickRound: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  pickRoundText: { fontSize: 12, color: '#a0aec0', fontWeight: 'bold' },
  pickPlayer: { fontSize: 14, color: '#e94560', fontWeight: 'bold', width: 80 },
  pickSong: { fontSize: 14, color: '#fff', flex: 1 },
  bonusBadge: { fontSize: 16, color: '#f6e05e' },
  emptyText: { color: '#a0aec0', textAlign: 'center', padding: 24 },
});
