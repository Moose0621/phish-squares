import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context';
import styles from './ProfilePage.module.css';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <span className={styles.avatar}>🎸</span>
        <p className={styles.username}>{user?.username}</p>
      </div>
      <button className={styles.logoutButton} onClick={() => void handleLogout()}>
        Sign Out
      </button>
    </div>
  );
}
