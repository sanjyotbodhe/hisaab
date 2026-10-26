import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Avatar } from './ui.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Hisaab home">
          <span className="brand-mark" aria-hidden="true">₹</span>
          <span className="brand-name">Hisaab</span>
        </Link>
        <div className="topbar-user">
          <Avatar name={user.name} size="sm" />
          <span className="topbar-name">{user.name}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
