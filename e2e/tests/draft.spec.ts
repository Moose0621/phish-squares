import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function registerAndGetToken(request: any, suffix: string): Promise<{ token: string; userId: string; username: string }> {
  const username = `draftuser_${suffix}_${Date.now()}`;
  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { username, password: 'TestPassword123!' },
  });
  const body = await response.json();
  return { token: body.token, userId: body.user.id, username };
}

test.describe('Game Draft Flow', () => {
  test('full game lifecycle: create \u2192 join \u2192 start \u2192 verify', async ({ request }) => {
    // Register host and player
    const host = await registerAndGetToken(request, 'host');
    const player = await registerAndGetToken(request, 'player');

    // Host creates a game
    const createResponse = await request.post(`${API_URL}/api/games`, {
      headers: { Authorization: `Bearer ${host.token}` },
      data: {
        showDate: '2026-07-04',
        showVenue: 'Madison Square Garden',
        maxPlayers: 4,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const game = await createResponse.json();
    expect(game.inviteCode).toHaveLength(6);
    expect(game.status).toBe('LOBBY');

    // Player joins via invite code
    const joinResponse = await request.post(`${API_URL}/api/games/join`, {
      headers: { Authorization: `Bearer ${player.token}` },
      data: { inviteCode: game.inviteCode },
    });
    expect(joinResponse.ok()).toBeTruthy();
    const joinedGame = await joinResponse.json();
    expect(joinedGame.players).toHaveLength(2);

    // Host starts the draft
    const startResponse = await request.post(`${API_URL}/api/games/${game.id}/start`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(startResponse.ok()).toBeTruthy();
    const startedGame = await startResponse.json();
    expect(startedGame.status).toBe('DRAFTING');
    expect(startedGame.draftOrder).toHaveLength(2);

    // Get game details
    const detailResponse = await request.get(`${API_URL}/api/games/${game.id}`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(detailResponse.ok()).toBeTruthy();
  });

  test('should not allow non-host to start draft', async ({ request }) => {
    const host = await registerAndGetToken(request, 'host2');
    const player = await registerAndGetToken(request, 'plyr2');

    // Create game
    const createResponse = await request.post(`${API_URL}/api/games`, {
      headers: { Authorization: `Bearer ${host.token}` },
      data: { showDate: '2026-07-04', showVenue: 'MSG' },
    });
    const game = await createResponse.json();

    // Player joins
    await request.post(`${API_URL}/api/games/join`, {
      headers: { Authorization: `Bearer ${player.token}` },
      data: { inviteCode: game.inviteCode },
    });

    // Player tries to start
    const startResponse = await request.post(`${API_URL}/api/games/${game.id}/start`, {
      headers: { Authorization: `Bearer ${player.token}` },
    });
    expect(startResponse.status()).toBe(403);
  });

  test('should not start with less than 2 players', async ({ request }) => {
    const host = await registerAndGetToken(request, 'solo');

    const createResponse = await request.post(`${API_URL}/api/games`, {
      headers: { Authorization: `Bearer ${host.token}` },
      data: { showDate: '2026-07-04', showVenue: 'MSG' },
    });
    const game = await createResponse.json();

    const startResponse = await request.post(`${API_URL}/api/games/${game.id}/start`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(startResponse.status()).toBe(400);
  });

  test('should not allow duplicate game joins', async ({ request }) => {
    const host = await registerAndGetToken(request, 'duph');

    const createResponse = await request.post(`${API_URL}/api/games`, {
      headers: { Authorization: `Bearer ${host.token}` },
      data: { showDate: '2026-07-04', showVenue: 'MSG' },
    });
    const game = await createResponse.json();

    // Host tries to join their own game again
    const joinResponse = await request.post(`${API_URL}/api/games/join`, {
      headers: { Authorization: `Bearer ${host.token}` },
      data: { inviteCode: game.inviteCode },
    });
    expect(joinResponse.status()).toBe(400);
  });

  test('should list user games', async ({ request }) => {
    const host = await registerAndGetToken(request, 'list');

    // Create a game
    await request.post(`${API_URL}/api/games`, {
      headers: { Authorization: `Bearer ${host.token}` },
      data: { showDate: '2026-07-04', showVenue: 'MSG' },
    });

    // List games
    const listResponse = await request.get(`${API_URL}/api/games`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(listResponse.ok()).toBeTruthy();
    const games = await listResponse.json();
    expect(games.length).toBeGreaterThanOrEqual(1);
  });

  test('should require auth for game endpoints', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/games`);
    expect(response.status()).toBe(401);
  });
});
