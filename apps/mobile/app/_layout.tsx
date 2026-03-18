import { Stack } from 'expo-router';
import { AuthProvider } from './auth-context';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a2e' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#16213e' },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="game/[id]/lobby"
          options={{ title: 'Game Lobby' }}
        />
        <Stack.Screen
          name="game/[id]/draft"
          options={{ title: 'Live Draft', headerBackVisible: false }}
        />
        <Stack.Screen
          name="game/[id]/results"
          options={{ title: 'Results' }}
        />
      </Stack>
    </AuthProvider>
  );
}
