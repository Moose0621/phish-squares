import { Navigate, Outlet, NavLink } from 'react-router-dom';
import { useAuth } from './auth-context';
import styles from './Layout.module.css';


export function ProtectedRoute() {
  const { isLoading, token } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px', color: '#a0aec0' }}>
        Loading…
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AppLayout() {
  const { user } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav className={styles.nav}>
        <NavLink to="/" className={styles.brand}>
          🎸 Phish Squares
        </NavLink>
        <div className={styles.navLinks}>
          <NavLink
            to="/"
            end
            className={({ isActive }: { isActive: boolean }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Games
          </NavLink>
          <NavLink
            to="/leaderboard"
            className={({ isActive }: { isActive: boolean }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Leaderboard
          </NavLink>
          {user?.isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }: { isActive: boolean }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
            >
              Admin
            </NavLink>
          )}
          <NavLink
            to="/profile"
            className={({ isActive }: { isActive: boolean }) =>
              `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
            }
          >
            Profile
          </NavLink>
        </div>
      </nav>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
