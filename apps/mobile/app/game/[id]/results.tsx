import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../api-client';

interface PickResult {
  id: string;
  userId: string;
  songName: string;
  round: number;
  isBonus: boolean;
  scored: boolean | null;
  user?: { username: string };
}

interface GameResult {
  id: string;
  showDate: string;
  showVenue: string;
  status: string;
  players: { userId: string; user: { id: string; username: string } }[];
  picks: PickResult[];
}

interface PlayerScore {
  userId: string;
  username: string;
  correct: number;
  total: number;
  picks: PickResult[];
}

export default function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [game, setGame] = useState<GameResult | null>(null);
  const [standings, setStandings] = useState<PlayerScore[]>([]);
  const [setlist, setSetlist] = useState<string[]>([]);

  useEffect(() => {
    loadResults();
    loadSetlist();
  }, []);

  const loadResults = async () => {
    try {
      const data = (await apiClient.getGameResults(id)) as GameResult;
      setGame(data);

      // Calculate standings
      const playerScores: Map<string, PlayerScore> = new Map();
      for (const player of data.players) {
        playerScores.set(player.userId, {
          userId: player.userId,
          username: player.user.username,
          correct: 0,
          total: 0,
          picks: [],
        });
      }

      for (const pick of data.picks) {
        const ps = playerScores.get(pick.userId);
        if (ps) {
          ps.picks.push(pick);
          if (pick.scored) {
            ps.correct++;
            ps.total += pick.isBonus ? 2 : 1;
          }
        }
      }

      const sorted = [...playerScores.values()].sort((a, b) => b.total - a.total);
      setStandings(sorted);
    } catch (error) {
      console.error('Failed to load results:', error);
    }
  };

  const loadSetlist = async () => {
    try {
      const data = (await apiClient.getGameSetlist(id)) as { setlist: string[] };
      setSetlist(data.setlist);
    } catch {
      // Setlist may not be available yet
    }
  };

  if (!game) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading results...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.venue}>{game.showVenue}</Text>
        <Text style={styles.date}>{game.showDate.split('T')[0]}</Text>
      </View>

      {/* Setlist */}
      {setlist.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Setlist</Text>
          <FlatList
            data={setlist}
            keyExtractor={(item, index) => `setlist-${index}`}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <View style={styles.setlistRow}>
                <Text style={styles.setlistNumber}>{index + 1}</Text>
                <Text style={styles.setlistSong}>{item}</Text>
              </View>
            )}
          />
        </>
      )}

      {/* Leaderboard */}
      <Text style={styles.sectionTitle}>Standings</Text>
      <FlatList
        data={standings}
        keyExtractor={(item) => item.userId}
        scrollEnabled={false}
        ListHeaderComponent={() => null}
        renderItem={({ item, index }) => (
          <View style={styles.standingRow}>
            <Text style={[styles.rank, index === 0 && styles.firstPlace]}>
              {index === 0 ? '🏆' : `#${index + 1}`}
            </Text>
            <Text style={styles.playerName}>{item.username}</Text>
            <View style={styles.scoreContainer}>
              <Text style={styles.score}>{item.total} pts</Text>
              <Text style={styles.correctCount}>{item.correct} correct</Text>
            </View>
          </View>
        )}
      />

      {/* All Picks */}
      <Text style={styles.sectionTitle}>All Picks</Text>
      <FlatList
        data={game.picks}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const player = game.players.find((p) => p.userId === item.userId);
          return (
            <View style={[styles.pickRow, item.scored && styles.correctPick]}>
              <View style={styles.pickInfo}>
                <Text style={styles.pickPlayer}>{player?.user.username}</Text>
                <Text style={styles.pickSong}>{item.songName}</Text>
              </View>
              <View style={styles.pickStatus}>
                {item.scored === true && <Text style={styles.checkmark}>✅</Text>}
                {item.scored === false && <Text style={styles.cross}>❌</Text>}
                {item.isBonus && <Text style={styles.bonusBadge}>★ 2x</Text>}
              </View>
            </View>
          );
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16213e' },
  loadingText: { color: '#a0aec0', textAlign: 'center', marginTop: 48 },
  header: { alignItems: 'center', padding: 20 },
  venue: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  date: { fontSize: 16, color: '#a0aec0', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', padding: 16, paddingBottom: 8 },
  setlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  setlistNumber: { fontSize: 12, color: '#a0aec0', width: 30 },
  setlistSong: { fontSize: 14, color: '#fff', flex: 1 },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
  },
  rank: { fontSize: 20, fontWeight: 'bold', color: '#a0aec0', width: 48 },
  firstPlace: { color: '#f6e05e' },
  playerName: { fontSize: 18, fontWeight: 'bold', color: '#fff', flex: 1 },
  scoreContainer: { alignItems: 'flex-end' },
  score: { fontSize: 20, fontWeight: 'bold', color: '#e94560' },
  correctCount: { fontSize: 12, color: '#a0aec0' },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  correctPick: { backgroundColor: 'rgba(72, 187, 120, 0.1)' },
  pickInfo: { flex: 1 },
  pickPlayer: { fontSize: 12, color: '#e94560', fontWeight: 'bold' },
  pickSong: { fontSize: 16, color: '#fff', marginTop: 2 },
  pickStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkmark: { fontSize: 18 },
  cross: { fontSize: 18 },
  bonusBadge: { fontSize: 12, color: '#f6e05e', fontWeight: 'bold' },
});
