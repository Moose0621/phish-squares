import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth-context';
import { apiClient } from '../api-client';
import styles from './AdminPage.module.css';

interface UserRow {
  id: string;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      apiClient.setToken(token);
      const data = await apiClient.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      void loadUsers();
    }
  }, [token, loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await apiClient.createUser(username.trim(), password);
      setUsername('');
      setPassword('');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (user: UserRow) => {
    if (!confirm(`Delete user "${user.username}"?`)) return;
    try {
      await apiClient.deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Admin</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Create User</h2>
        {error && <p className={styles.error}>{error}</p>}
        <form className={styles.form} onSubmit={(e) => void handleCreate(e)}>
          <input
            className={styles.input}
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
          <input
            className={styles.input}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button className={styles.addButton} type="submit" disabled={loading}>
            {loading ? '...' : 'Add'}
          </button>
        </form>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Users ({users.length})</h2>
        {users.length === 0 ? (
          <p className={styles.empty}>No users yet</p>
        ) : (
          <ul className={styles.userList}>
            {users.map((u) => (
              <li key={u.id} className={styles.userItem}>
                <div className={styles.userInfo}>
                  <span className={styles.username}>{u.username}</span>
                  {u.isAdmin && <span className={styles.badge}>Admin</span>}
                </div>
                {!u.isAdmin && (
                  <button className={styles.deleteButton} onClick={() => void handleDelete(u)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
