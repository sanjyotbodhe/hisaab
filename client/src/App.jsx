import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorState, Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { useAuth } from './lib/auth.jsx';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import GroupPage from './pages/GroupPage.jsx';
import JoinPage from './pages/JoinPage.jsx';

function Boot() {
  const { status, slow, retry, bootError } = useAuth();
  if (status === 'offline') {
    // status 0 = no response at all (network); otherwise show what the server said.
    const message =
      !bootError || bootError.status === 0
        ? "Can't reach Hisaab right now. Check your connection."
        : `Hisaab is having trouble: ${bootError.message}`;
    return (
      <div className="boot">
        <ErrorState error={{ message }} onRetry={retry} />
      </div>
    );
  }
  return (
    <div className="boot">
      <Loading text={slow ? 'Still connecting to the server…' : 'Loading…'} />
    </div>
  );
}

function RequireAuth({ children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status !== 'ready') return <Boot />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status !== 'ready') return <Boot />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    // Only follow same-site relative paths (no open redirects).
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  return children;
}

function NotFound() {
  return (
    <div className="page narrow">
      <h1>Page not found</h1>
      <p className="muted">The page you opened doesn’t exist or you don’t have access to it.</p>
      <Link className="btn btn-primary" to="/">
        Go to your groups
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <AuthPage mode="login" />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <AuthPage mode="register" />
          </PublicOnly>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/groups/:groupId"
        element={
          <RequireAuth>
            <GroupPage />
          </RequireAuth>
        }
      />
      <Route
        path="/join/:code"
        element={
          <RequireAuth>
            <JoinPage />
          </RequireAuth>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <NotFound />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
