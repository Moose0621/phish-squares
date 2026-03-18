import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../../auth-context';
import { apiClient } from '../../api-client';
import { API_URL } from '../../config';
import { SocketEvent } from '@phish-squares/shared';

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

export default function LobbyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, token } = useAuth();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const loadGame = useCallback(async () => {
    try {
      const data = (await apiClient.getGame(id)) as GameDetail;
      setGame(data);
      if (data.status === 'DRAFTING') {
        router.replace(`/game/${id}/draft`);
      }
    } catch {
      Alert.alert('Error', 'Failed to load game');
    }
  }, [id]);

  // Initial load + WebSocket connection for real-time lobby updates
  useEffect(() => {
    loadGame();

    if (!token) return;

    const socket = io(`${API_URL}/draft`, {
      auth: { token },
    });

    socket.on('connect', () => {
      socket.emit(SocketEvent.JOIN_DRAFT, id);
    });

    socket.on('lobby-update', (data: GameDetail) => {
      setGame(data);
      if (data.status === 'DRAFTING') {
        router.replace(`/game/${id}/draft`);
      }
    });

    socket.on('error', (message: string) => {
      console.warn('Lobby socket error:', message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [id, token, loadGame]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGame();
    setRefreshing(false);
  }, [loadGame]);

  const handleStartDraft = async () => {
    try {
      await apiClient.startGame(id);
      router.replace(`/game/${id}/draft`);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to start draft');
    }
  };

  const handleShareCode = async () => {
    if (!game) return;
    await Share.share({
      message: `Join my Phish Squares game! Code: ${game.inviteCode}`,
    });
  };

  if (!game) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isHost = user?.id === game.hostUserId;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.venue}>{game.showVenue}</Text>
        <Text style={styles.date}>{game.showDate.split('T')[0]}</Text>
      </View>

      <TouchableOpacity style={styles.codeCard} onPress={handleShareCode}>
        <Text style={styles.codeLabel}>Invite Code</Text>
        <Text style={styles.codeValue}>{game.inviteCode}</Text>
        <Text style={styles.codeTap}>Tap to share</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>
        Players ({game.players.length}/{game.maxPlayers})
      </Text>

      <FlatList
        data={game.players}
        keyExtractor={(item) => item.userId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#e94560" />
        }
        renderItem={({ item, index }) => (
          <View style={styles.playerRow}>
            <Text style={styles.playerNumber}>{index + 1}</Text>
            <Text style={styles.playerName}>{item.user.username}</Text>
            {item.userId === game.hostUserId && (
              <Text style={styles.hostBadge}>HOST</Text>
            )}
          </View>
        )}
      />

      {isHost && (
        <TouchableOpacity
          style={[styles.startButton, game.players.length < 2 && styles.buttonDisabled]}
          onPress={handleStartDraft}
          disabled={game.players.length < 2}
        >
          <Text style={styles.startButtonText}>Start Draft</Text>
        </TouchableOpacity>
      )}

      {!isHost && (
        <View style={styles.waitingBanner}>
          <Text style={styles.waitingText}>Waiting for host to start the draft...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e', padding: 16 },
  loadingText: { color: '#a0aec0', textAlign: 'center', marginTop: 48 },
  header: { alignItems: 'center', marginBottom: 24 },
  venue: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  date: { fontSize: 16, color: '#a0aec0', marginTop: 4 },
  codeCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#e94560',
  },
  codeLabel: { fontSize: 14, color: '#a0aec0' },
  codeValue: { fontSize: 36, fontWeight: 'bold', color: '#e94560', letterSpacing: 4, marginVertical: 8, fontFamily: 'monospace' },
  codeTap: { fontSize: 12, color: '#a0aec0' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  playerNumber: { fontSize: 16, fontWeight: 'bold', color: '#e94560', width: 30 },
  playerName: { fontSize: 16, color: '#fff', flex: 1 },
  hostBadge: { fontSize: 10, color: '#f6e05e', fontWeight: 'bold', backgroundColor: '#2d3748', padding: 4, borderRadius: 4 },
  startButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.4 },
  startButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  waitingBanner: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  waitingText: { color: '#a0aec0', fontSize: 16 },
});
