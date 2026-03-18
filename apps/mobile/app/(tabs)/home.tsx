import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../auth-context';
import { apiClient } from '../api-client';

interface GameItem {
  id: string;
  showDate: string;
  showVenue: string;
  status: string;
  inviteCode: string;
  players: { user: { username: string } }[];
}

export default function HomeScreen() {
  const { token } = useAuth();
  const [games, setGames] = useState<GameItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showDate, setShowDate] = useState('');
  const [showVenue, setShowVenue] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    if (token) {
      apiClient.setToken(token);
      loadGames();
    }
  }, [token]);

  const loadGames = useCallback(async () => {
    try {
      const data = await apiClient.getGames();
      setGames(data as GameItem[]);
    } catch (error) {
      console.error('Failed to load games:', error);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGames();
    setRefreshing(false);
  }, [loadGames]);

  const handleCreateGame = async () => {
    if (!showDate.trim() || !showVenue.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    try {
      const game = (await apiClient.createGame({
        showDate: showDate.trim(),
        showVenue: showVenue.trim(),
      })) as GameItem;
      setShowCreateModal(false);
      setShowDate('');
      setShowVenue('');
      router.push(`/game/${game.id}/lobby`);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create game');
    }
  };

  const handleJoinGame = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }
    try {
      const game = (await apiClient.joinGame(inviteCode.trim().toUpperCase())) as GameItem;
      setShowJoinModal(false);
      setInviteCode('');
      router.push(`/game/${game.id}/lobby`);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to join game');
    }
  };

  const navigateToGame = (game: GameItem) => {
    if (game.status === 'LOBBY') {
      router.push(`/game/${game.id}/lobby`);
    } else if (game.status === 'DRAFTING') {
      router.push(`/game/${game.id}/draft`);
    } else {
      router.push(`/game/${game.id}/results`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'LOBBY': return '#f6e05e';
      case 'DRAFTING': return '#48bb78';
      case 'LOCKED': return '#ed8936';
      case 'SCORED': return '#e94560';
      default: return '#888';
    }
  };

  const renderGame = ({ item }: { item: GameItem }) => (
    <TouchableOpacity style={styles.gameCard} onPress={() => navigateToGame(item)}>
      <View style={styles.gameHeader}>
        <Text style={styles.gameVenue}>{item.showVenue}</Text>
        <Text style={[styles.gameStatus, { color: getStatusColor(item.status) }]}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.gameDate}>{item.showDate.split('T')[0]}</Text>
      <Text style={styles.gamePlayers}>
        {item.players.length} player{item.players.length !== 1 ? 's' : ''}
      </Text>
      {item.status === 'LOBBY' && (
        <Text style={styles.inviteCode}>Code: {item.inviteCode}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowCreateModal(true)}>
          <Text style={styles.actionButtonText}>+ New Game</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.joinButton]} onPress={() => setShowJoinModal(true)}>
          <Text style={styles.actionButtonText}>Join Game</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={games}
        keyExtractor={(item) => item.id}
        renderItem={renderGame}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e94560" />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No games yet. Create one or join with an invite code!</Text>
        }
      />

      {/* Create Game Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Game</Text>
            <TextInput
              style={styles.input}
              placeholder="Show Date (YYYY-MM-DD)"
              placeholderTextColor="#888"
              value={showDate}
              onChangeText={setShowDate}
            />
            <TextInput
              style={styles.input}
              placeholder="Venue"
              placeholderTextColor="#888"
              value={showVenue}
              onChangeText={setShowVenue}
            />
            <TouchableOpacity style={styles.modalButton} onPress={handleCreateGame}>
              <Text style={styles.actionButtonText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Join Game Modal */}
      <Modal visible={showJoinModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join Game</Text>
            <TextInput
              style={styles.input}
              placeholder="Invite Code"
              placeholderTextColor="#888"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity style={styles.modalButton} onPress={handleJoinGame}>
              <Text style={styles.actionButtonText}>Join</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowJoinModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  actions: { flexDirection: 'row', padding: 16, gap: 12 },
  actionButton: {
    flex: 1,
    backgroundColor: '#e94560',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  joinButton: { backgroundColor: '#0f3460' },
  actionButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  list: { padding: 16 },
  gameCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  gameHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gameVenue: { fontSize: 18, fontWeight: 'bold', color: '#fff', flex: 1 },
  gameStatus: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
  gameDate: { fontSize: 14, color: '#a0aec0', marginTop: 4 },
  gamePlayers: { fontSize: 14, color: '#a0aec0', marginTop: 2 },
  inviteCode: { fontSize: 14, color: '#e94560', marginTop: 4, fontFamily: 'monospace' },
  emptyText: { color: '#a0aec0', textAlign: 'center', marginTop: 48, fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 16, textAlign: 'center' },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d3748',
  },
  modalButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelText: { color: '#a0aec0', textAlign: 'center', marginTop: 16, fontSize: 16 },
});
