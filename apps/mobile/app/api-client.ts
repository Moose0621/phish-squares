import { API_URL } from './config';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  // Games
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

  async getGameSetlist(id: string) {
    return this.request(`/api/games/${encodeURIComponent(id)}/setlist`);
  }

  // Songs
  async searchSongs(query: string) {
    return this.request(`/api/songs/search?q=${encodeURIComponent(query)}`);
  }

  async getAllSongs() {
    return this.request('/api/songs');
  }
}

export const apiClient = new ApiClient();
