import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { apiClient } from '../../api-client';

interface BasicGame {
  showVenue: string;
}

export default function GameLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [venue, setVenue] = useState('Game');

  useEffect(() => {
    if (!id) return;
    apiClient
      .getGame(id)
      .then((game) => {
        const g = game as BasicGame;
        if (g.showVenue) setVenue(g.showVenue);
      })
      .catch(() => undefined);
  }, [id]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a1a2e' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerBackVisible: true,
        title: venue,
      }}
    />
  );
}
