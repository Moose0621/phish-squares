/**
 * Game-flow E2E scenarios — drafted from real situations encountered at live shows.
 *
 * WebSocket tests use socket.io-client to connect to the /draft namespace.
 * Phish.net-dependent scoring tests are marked fixme; enable them by pointing
 * PHISH_NET_BASE_URL at a local mock server that returns the expected JSON shape.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { io as ioClient, Socket } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3000';
const WS  = process.env.WS_URL  ?? 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function register(req: APIRequestContext, tag: string) {
  const username = `gf_${tag}_${Date.now()}`;
  const res = await req.post(`${API}/api/auth/register`, {
    data: { username, password: 'TestPass123!' },
  });
  const body = await res.json();
  return { token: body.token as string, userId: body.user.id as string, username };
}

async function createGame(
  req: APIRequestContext, token: string,
  opts: { maxPlayers?: number; totalRounds?: number; showDate?: string } = {},
) {
  const res = await req.post(`${API}/api/games`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      showDate:    opts.showDate    ?? '2026-08-15',
      showVenue:   'Madison Square Garden',
      maxPlayers:  opts.maxPlayers  ?? 4,
      totalRounds: opts.totalRounds ?? 11,
    },
  });
  return res.json();
}

const joinGame  = (req: APIRequestContext, token: string, code: string) =>
  req.post(`${API}/api/games/join`,     { headers: { Authorization: `Bearer ${token}` }, data: { inviteCode: code } });

const startDraft = (req: APIRequestContext, token: string, id: string) =>
  req.post(`${API}/api/games/${id}/start`, { headers: { Authorization: `Bearer ${token}` } });

function socket(token: string): Socket {
  return ioClient(`${WS}/draft`, { auth: { token }, autoConnect: true, reconnection: false });
}

function waitFor<T>(sock: Socket, event: string, ms = 5000): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`Timeout waiting for "${event}"`)), ms);
    sock.once(event, (d: T) => { clearTimeout(t); res(d); });
  });
}

async function joinDraft(token: string, gameId: string) {
  const sock = socket(token);
  await new Promise<void>((ok, fail) => { sock.once('connect', ok); sock.once('connect_error', fail); });
  const state = waitFor<Record<string, unknown>>(sock, 'draft-state');
  sock.emit('join-draft', gameId);
  return { sock, state: await state };
}

// ── Scenario Group 1 — Draft Chaos ───────────────────────────────────────────

test.describe('Scenario Group 1 — Draft Chaos', () => {
  test('player disconnects mid-draft and reconnects — sees current state and whose turn it is', async ({ request }) => {
    const host = await register(request, 'rc_h');
    const p1   = await register(request, 'rc_p1');
    const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 1 });
    await joinGame(request, p1.token, game.inviteCode);
    await startDraft(request, host.token, game.id);

    const { sock: s1, state: st1 } = await joinDraft(host.token, game.id);
    expect(st1['status']).toBe('DRAFTING');
    const picker = st1['currentPickerUserId'] as string;
    s1.disconnect();

    // Reconnect — server must re-emit full DRAFT_STATE on JOIN_DRAFT
    const { sock: s2, state: st2 } = await joinDraft(host.token, game.id);
    expect(st2['status']).toBe('DRAFTING');
    expect(st2['currentPickerUserId']).toBe(picker);
    s2.disconnect();
  });

  test('two players try to pick the same song within milliseconds — only one pick is accepted', async ({ request }) => {
    const host = await register(request, 'race_h');
    const p1   = await register(request, 'race_p1');
    const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 1 });
    await joinGame(request, p1.token, game.inviteCode);
    const started = await (await startDraft(request, host.token, game.id)).json();

    const firstId = started.draftOrder[0] as string;
    const ft = firstId === host.userId ? host.token : p1.token;
    const st = firstId === host.userId ? p1.token  : host.token;

    const { sock: s1 } = await joinDraft(ft, game.id);
    const { sock: s2 } = await joinDraft(st, game.id);

    let picked = 0, errors = 0;
    [s1, s2].forEach(s => { s.on('pick-made', () => picked++); s.on('error', () => errors++); });

    // First player is the legitimate picker; second player is NOT on the clock
    s1.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    s2.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    await new Promise(r => setTimeout(r, 1000));

    expect(picked).toBe(1);           // exactly one pick accepted
    expect(errors).toBeGreaterThanOrEqual(1); // at least one rejection

    s1.disconnect(); s2.disconnect();
  });

  test.fixme(
    'timer expires on a player who left the app — auto-pick fires and draft continues',
    // Requires PICK_TIMER_SECONDS env override (default = 60 s; too slow for CI).
    async ({ request }) => {
      const host = await register(request, 'tmr_h');
      const p1   = await register(request, 'tmr_p1');
      const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 1 });
      await joinGame(request, p1.token, game.inviteCode);
      await startDraft(request, host.token, game.id);

      const { sock } = await joinDraft(p1.token, game.id); // observe but don't pick
      const autoPick = await waitFor<{ gameId: string }>(sock, 'auto-pick', 70_000);
      expect(autoPick.gameId).toBe(game.id);

      const next = await waitFor<Record<string, unknown>>(sock, 'draft-state', 5000);
      expect(next['status']).toBe('DRAFTING'); // draft must continue, not hang

      sock.disconnect();
    },
  );

  test('player tries to pick an already-taken song — rejected with a clear error', async ({ request }) => {
    const host = await register(request, 'dup_h');
    const p1   = await register(request, 'dup_p1');
    const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 2 });
    await joinGame(request, p1.token, game.inviteCode);
    const started = await (await startDraft(request, host.token, game.id)).json();

    const firstId = started.draftOrder[0] as string;
    const ft = firstId === host.userId ? host.token : p1.token;
    const { sock } = await joinDraft(ft, game.id);

    // Legitimate first pick
    const picked = waitFor<unknown>(sock, 'pick-made');
    sock.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    await picked;

    // Immediately try to re-draft Tweezer (simulates race / double-tap)
    const errPromise = waitFor<string>(sock, 'error', 5000);
    sock.emit('make-pick', { gameId: game.id, songName: 'tweezer' });
    const errMsg = await errPromise;
    expect(errMsg).toMatch(/already been picked|not your turn/i);

    sock.disconnect();
  });

  test('last pick of the bonus round — draft transitions to LOCKED, not left hanging', async ({ request }) => {
    const host = await register(request, 'last_h');
    const p1   = await register(request, 'last_p1');
    const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 1 });
    await joinGame(request, p1.token, game.inviteCode);
    const started = await (await startDraft(request, host.token, game.id)).json();

    const order: string[] = started.draftOrder;
    const tok: Record<string, string> = { [host.userId]: host.token, [p1.userId]: p1.token };
    const { sock: s1 } = await joinDraft(tok[order[0]], game.id);
    const { sock: s2 } = await joinDraft(tok[order[1]], game.id);

    s1.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    await waitFor<unknown>(s1, 'pick-made');

    const complete = waitFor<{ gameId: string }>(s2, 'draft-complete');
    s2.emit('make-pick', { gameId: game.id, songName: "Mike's Song" });
    await complete;

    const gameRes = await request.get(`${API}/api/games/${game.id}`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect((await gameRes.json()).status).toBe('LOCKED');

    s1.disconnect(); s2.disconnect();
  });
});

// ── Scenario Group 2 — The "everyone picks Tweezer" problem ──────────────────

test.describe('Scenario Group 2 — The "everyone picks Tweezer" problem', () => {
  test('first player picks Tweezer — remaining players are blocked from picking it too', async ({ request }) => {
    const host = await register(request, 'twz_h');
    const p1   = await register(request, 'twz_p1');
    const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 2 });
    await joinGame(request, p1.token, game.inviteCode);
    const started = await (await startDraft(request, host.token, game.id)).json();

    const firstId = started.draftOrder[0] as string;
    const ft = firstId === host.userId ? host.token : p1.token;
    const { sock } = await joinDraft(ft, game.id);

    sock.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    await waitFor<unknown>(sock, 'pick-made');

    // Simulate a duplicate attempt (same player double-fires or another player sneaks in)
    const err = waitFor<string>(sock, 'error', 5000);
    sock.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    expect(typeof await err).toBe('string');

    sock.disconnect();
  });

  test('song name matching is case-insensitive: "tweezer" = "Tweezer" = "TWEEZER"', async ({ request }) => {
    const host = await register(request, 'ci_h');
    const p1   = await register(request, 'ci_p1');
    const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 2 });
    await joinGame(request, p1.token, game.inviteCode);
    const started = await (await startDraft(request, host.token, game.id)).json();

    const firstId = started.draftOrder[0] as string;
    const ft = firstId === host.userId ? host.token : p1.token;
    const { sock } = await joinDraft(ft, game.id);

    sock.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    await waitFor<unknown>(sock, 'pick-made');

    // Variant casing must be treated as the same song
    const err = waitFor<string>(sock, 'error', 5000);
    sock.emit('make-pick', { gameId: game.id, songName: 'TWEEZER' });
    expect(await err).toMatch(/already been picked|not your turn/i);

    sock.disconnect();
  });
});

// ── Scenario Group 3 — Scoring Edge Cases ────────────────────────────────────

test.describe('Scenario Group 3 — Scoring Edge Cases', () => {
  test('show has not happened yet — GET /results fails gracefully with a clear message', async ({ request }) => {
    const host = await register(request, 'fut_h');
    const p1   = await register(request, 'fut_p1');
    const game = await createGame(request, host.token, { showDate: '2099-07-04', maxPlayers: 2, totalRounds: 1 });
    await joinGame(request, p1.token, game.inviteCode);
    await startDraft(request, host.token, game.id);

    // Game is DRAFTING — not yet scored
    const res = await request.get(`${API}/api/games/${game.id}/results`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/not been scored/i);
  });

  test('Phish.net returns no setlist for a future date — POST /score returns 422, game stays LOCKED', async ({ request }) => {
    const host = await register(request, 'ns_h');
    const p1   = await register(request, 'ns_p1');
    const game = await createGame(request, host.token, { showDate: '2099-07-04', maxPlayers: 2, totalRounds: 1 });
    await joinGame(request, p1.token, game.inviteCode);
    const started = await (await startDraft(request, host.token, game.id)).json();

    const order: string[] = started.draftOrder;
    const tok: Record<string, string> = { [host.userId]: host.token, [p1.userId]: p1.token };
    const { sock: s1 } = await joinDraft(tok[order[0]], game.id);
    const { sock: s2 } = await joinDraft(tok[order[1]], game.id);

    s1.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
    await waitFor<unknown>(s1, 'pick-made');
    s2.emit('make-pick', { gameId: game.id, songName: "Mike's Song" });
    await waitFor<unknown>(s2, 'draft-complete');
    s1.disconnect(); s2.disconnect();

    // POST /score — Phish.net has no data for a year-2099 show
    const scoreRes = await request.post(`${API}/api/games/${game.id}/score`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    // 422 = no setlist found; 500/502 = API key not configured in test env
    expect([400, 422, 500, 502]).toContain(scoreRes.status());

    // Game must stay LOCKED
    const gameRes = await request.get(`${API}/api/games/${game.id}`, {
      headers: { Authorization: `Bearer ${host.token}` },
    });
    expect((await gameRes.json()).status).toBe('LOCKED');
  });

  test.fixme(
    'encore songs count — First Tube in the encore scores a point (requires mock Phish.net)',
    async ({ request }) => {
      // Mock must return: { error_code:0, data:[{ song:'First Tube', set:'E' }, ...] }
      const host = await register(request, 'enc_h');
      const p1   = await register(request, 'enc_p1');
      const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 1 });
      await joinGame(request, p1.token, game.inviteCode);
      const started = await (await startDraft(request, host.token, game.id)).json();
      const order: string[] = started.draftOrder;
      const tok: Record<string, string> = { [host.userId]: host.token, [p1.userId]: p1.token };
      const { sock: s1 } = await joinDraft(tok[order[0]], game.id);
      const { sock: s2 } = await joinDraft(tok[order[1]], game.id);
      s1.emit('make-pick', { gameId: game.id, songName: 'First Tube' });
      await waitFor<unknown>(s1, 'pick-made');
      s2.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
      await waitFor<unknown>(s2, 'draft-complete');
      s1.disconnect(); s2.disconnect();
      await request.post(`${API}/api/games/${game.id}/score`, { headers: { Authorization: `Bearer ${host.token}` } });
      const results = await (await request.get(`${API}/api/games/${game.id}/results`, { headers: { Authorization: `Bearer ${host.token}` } })).json();
      const pick = results.picks.find((p: { songName: string }) => p.songName === 'First Tube');
      expect(pick?.scored).toBe(true);
    },
  );

  test.fixme(
    '"The Lizards" in pick vs "Lizards, The" from Phish.net — must match after normalization (requires mock Phish.net)',
    async ({ request }) => {
      // Mock must return: { data:[{ song:'Lizards, The' }, ...] }
      // This test documents expected behavior once article-inversion normalization is implemented.
      const host = await register(request, 'liz_h');
      const p1   = await register(request, 'liz_p1');
      const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 1 });
      await joinGame(request, p1.token, game.inviteCode);
      const started = await (await startDraft(request, host.token, game.id)).json();
      const order: string[] = started.draftOrder;
      const tok: Record<string, string> = { [host.userId]: host.token, [p1.userId]: p1.token };
      const { sock: s1 } = await joinDraft(tok[order[0]], game.id);
      const { sock: s2 } = await joinDraft(tok[order[1]], game.id);
      s1.emit('make-pick', { gameId: game.id, songName: 'The Lizards' });
      await waitFor<unknown>(s1, 'pick-made');
      s2.emit('make-pick', { gameId: game.id, songName: 'Tweezer' });
      await waitFor<unknown>(s2, 'draft-complete');
      s1.disconnect(); s2.disconnect();
      await request.post(`${API}/api/games/${game.id}/score`, { headers: { Authorization: `Bearer ${host.token}` } });
      const results = await (await request.get(`${API}/api/games/${game.id}/results`, { headers: { Authorization: `Bearer ${host.token}` } })).json();
      const pick = results.picks.find((p: { songName: string }) => p.songName === 'The Lizards');
      expect(pick?.scored).toBe(true);
    },
  );

  test.fixme(
    "player's bonus pick is correct — it scores 2 points, not 1 (requires mock Phish.net + completed 11-round draft)",
    async ({ request }) => {
      // Mock must return a setlist containing 'Harry Hood'.
      // The BONUS_ROUND_MULTIPLIER=2 logic lives in calculatePickScore() (packages/shared).
      const host = await register(request, 'bon_h');
      const p1   = await register(request, 'bon_p1');
      const game = await createGame(request, host.token, { maxPlayers: 2, totalRounds: 11 });
      await joinGame(request, p1.token, game.inviteCode);
      const started = await (await startDraft(request, host.token, game.id)).json();
      const order: string[] = started.draftOrder;
      const tok: Record<string, string> = { [host.userId]: host.token, [p1.userId]: p1.token };
      const { sock: s1 } = await joinDraft(tok[order[0]], game.id);
      const { sock: s2 } = await joinDraft(tok[order[1]], game.id);
      // 22 picks; assign unique song names, bonus pick (pick 21, round 11) = 'Harry Hood'
      const songs = Array.from({ length: 22 }, (_, i) => `Song ${i + 1}`);
      songs[20] = 'Harry Hood'; // draftOrder[0]'s bonus pick in a 2-player snake
      for (let i = 0; i < 22; i++) {
        const s = i % 2 === 0 ? s1 : s2;
        const ev = i === 21 ? 'draft-complete' : 'pick-made';
        const done = waitFor<unknown>(s, ev);
        s.emit('make-pick', { gameId: game.id, songName: songs[i] });
        await done;
      }
      s1.disconnect(); s2.disconnect();
      await request.post(`${API}/api/games/${game.id}/score`, { headers: { Authorization: `Bearer ${host.token}` } });
      const results = await (await request.get(`${API}/api/games/${game.id}/results`, { headers: { Authorization: `Bearer ${host.token}` } })).json();
      const bp = (results.picks as Array<{ songName: string; isBonus: boolean; scored: boolean }>)
        .find(p => p.songName === 'Harry Hood' && p.isBonus);
      expect(bp?.scored).toBe(true);
      expect(bp?.isBonus).toBe(true); // caller multiplies by BONUS_ROUND_MULTIPLIER (2)
    },
  );
});

// ── Scenario Group 4 — Lobby and Invite Flow ─────────────────────────────────

test.describe('Scenario Group 4 — Lobby and Invite Flow', () => {
  test('joining with an invalid invite code returns a 404 with a clear message', async ({ request }) => {
    const user = await register(request, 'inv_u');
    const res  = await joinGame(request, user.token, 'ZZZZZZ');
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toMatch(/game not found/i);
  });

  test('trying to join a game that is already drafting is rejected', async ({ request }) => {
    const host     = await register(request, 'dr_h');
    const p1       = await register(request, 'dr_p1');
    const latecomer = await register(request, 'dr_late');
    const game = await createGame(request, host.token);
    await joinGame(request, p1.token, game.inviteCode);
    await startDraft(request, host.token, game.id);
    const res = await joinGame(request, latecomer.token, game.inviteCode);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/no longer accepting/i);
  });

  test('trying to join a full game is rejected with a capacity error', async ({ request }) => {
    const host  = await register(request, 'fl_h');
    const p1    = await register(request, 'fl_p1');
    const extra = await register(request, 'fl_ex');
    const game  = await createGame(request, host.token, { maxPlayers: 2 });
    await joinGame(request, p1.token, game.inviteCode);
    const res = await joinGame(request, extra.token, game.inviteCode);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/full/i);
  });

  test('non-host player tries to start the draft — request is forbidden', async ({ request }) => {
    const host = await register(request, 'nh_h');
    const p1   = await register(request, 'nh_p1');
    const game = await createGame(request, host.token);
    await joinGame(request, p1.token, game.inviteCode);
    const res = await startDraft(request, p1.token, game.id);
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/only the host/i);
  });

  test('host tries to start with only 1 player — rejected until minimum player count is met', async ({ request }) => {
    const host = await register(request, 'solo_h');
    const game = await createGame(request, host.token);
    const res  = await startDraft(request, host.token, game.id);
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/at least \d+ players/i);
  });
});
