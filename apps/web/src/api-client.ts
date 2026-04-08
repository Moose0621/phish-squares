import { API_URL } from './config';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  async getGames() {
    return this.request('/api/games');
  }

  async getGame(id: string) {
    return this.request(`/api/games/${encodeURIComponent(id)}`);
  }

  async createGame(data: { showDate: string; showVenue: string; maxPlayers?: number }) {
    return this.request('/api/games', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async joinGame(inviteCode: string) {
    return this.request('/api/games/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async startGame(id: string) {
    return this.request(`/api/games/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    });
  }

  async getGameResults(id: string) {
    return this.request(`/api/games/${encodeURIComponent(id)}/results`);
  }

  async searchSongs(query: string, gameId?: string) {
    let url = `/api/songs/search?q=${encodeURIComponent(query)}`;
    if (gameId) url += `&gameId=${encodeURIComponent(gameId)}`;
    return this.request(url);
  }

  async getAllSongs() {
    return this.request('/api/songs');
  }

  async addCustomSong(name: string) {
    return this.request<{ id: string; name: string; isCustom: boolean }>('/api/songs/custom', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // Admin endpoints
  async getUsers() {
    return this.request<{ id: string; username: string; isAdmin: boolean; createdAt: string }[]>('/api/admin/users');
  }

  async createUser(username: string, password: string) {
    return this.request<{ id: string; username: string; isAdmin: boolean; createdAt: string }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async deleteUser(id: string) {
    return this.request(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async resetUserPassword(id: string, password: string) {
    return this.request(`/api/admin/users/${encodeURIComponent(id)}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    });
  }

  async uploadSetlistImage(gameId: string, imageFile: File): Promise<{ songs: string[] }> {
    const formData = new FormData();
    formData.append('image', imageFile);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_URL}/api/games/${encodeURIComponent(gameId)}/setlist-image`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<{ songs: string[] }>;
  }

  async scoreGameWithSetlist(gameId: string, setlist: string[]) {
    return this.request(`/api/games/${encodeURIComponent(gameId)}/score-setlist`, {
      method: 'POST',
      body: JSON.stringify({ setlist }),
    });
  }

  // Run endpoints
  async getRuns() {
    return this.request('/api/runs');
  }

  async getRun(id: string) {
    return this.request(`/api/runs/${encodeURIComponent(id)}`);
  }

  async createRun(data: { name: string; venue: string; startDate: string; endDate: string }) {
    return this.request('/api/runs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async joinRun(inviteCode: string) {
    return this.request('/api/runs/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
  }

  async getRunStandings(id: string) {
    return this.request(`/api/runs/${encodeURIComponent(id)}/standings`);
  }

  async updateRun(id: string, data: { name?: string; venue?: string }) {
    return this.request(`/api/runs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteRunGame(runId: string, gameId: string) {
    return this.request(`/api/runs/${encodeURIComponent(runId)}/games/${encodeURIComponent(gameId)}`, {
      method: 'DELETE',
    });
  }

  async addRunGame(runId: string, showDate: string) {
    return this.request(`/api/runs/${encodeURIComponent(runId)}/games`, {
      method: 'POST',
      body: JSON.stringify({ showDate }),
    });
  }

  // Stats endpoints
  async getMyStats() {
    return this.request('/api/users/me/stats');
  }

  async getUserStats(id: string) {
    return this.request(`/api/users/${encodeURIComponent(id)}/stats`);
  }

  // Leaderboard
  async getLeaderboard(sort: string = 'points') {
    return this.request(`/api/leaderboard?sort=${encodeURIComponent(sort)}`);
  }
}

export const apiClient = new ApiClient();
