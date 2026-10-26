import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { formatINR } from '../lib/format.js';
import { GroupsProvider, useGroups } from '../lib/groups.jsx';
import { useToast } from '../lib/toast.jsx';
import CreateGroupForm from './CreateGroupForm.jsx';
import { Icon } from './icons.jsx';
import { Avatar, Modal } from './ui.jsx';

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Hisaab home">
      <span className="brand-mark" aria-hidden="true">
        ₹
      </span>
      <span className="brand-name">Hisaab</span>
    </Link>
  );
}

function Sidebar({ onNewGroup }) {
  const { user, logout } = useAuth();
  const groups = useGroups();
  const list = groups.data?.groups ?? [];

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <Brand />
      <nav className="side-nav">
        <NavLink to="/" end className="side-link">
          <Icon name="home" />
          <span>Overview</span>
        </NavLink>
      </nav>

      <div className="side-section">
        <div className="side-heading">
          <span>Groups</span>
          <button type="button" className="side-add" onClick={onNewGroup} aria-label="New group" title="New group">
            <Icon name="plus" size={16} />
          </button>
        </div>
        {groups.loading && !groups.data && <p className="side-empty">Loading…</p>}
        {groups.error && !groups.data && (
          <button type="button" className="side-empty side-retry" onClick={groups.reload}>
            Couldn’t load groups. Retry
          </button>
        )}
        {groups.data && list.length === 0 && <p className="side-empty">No groups yet</p>}
        <ul className="side-groups">
          {list.map((g) => (
            <li key={g.id}>
              <NavLink to={`/groups/${g.id}`} className="side-group">
                <span className="side-group-name">{g.name}</span>
                <span className={`side-group-bal ${g.myBalance > 0 ? 'pos' : g.myBalance < 0 ? 'neg' : ''}`}>
                  {g.myBalance === 0 ? 'settled' : `${g.myBalance > 0 ? '+' : '−'}${formatINR(Math.abs(g.myBalance))}`}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="side-user">
        <Avatar name={user.name} size="sm" />
        <span className="side-user-text">
          <span className="side-user-name">{user.name}</span>
          <span className="side-user-email">{user.email}</span>
        </span>
        <button type="button" className="side-logout" onClick={logout} aria-label="Log out" title="Log out">
          <Icon name="logout" size={17} />
        </button>
      </div>
    </aside>
  );
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  const groups = useGroups();
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  return (
    <div className="app">
      <Sidebar onNewGroup={() => setCreating(true)} />
      <header className="mobilebar">
        <Brand />
        <div className="mobilebar-user">
          <Avatar name={user.name} size="sm" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="main">{children}</main>

      <Modal open={creating} onClose={() => setCreating(false)} title="New group">
        <CreateGroupForm
          onCancel={() => setCreating(false)}
          onCreated={(g) => {
            setCreating(false);
            groups.reload();
            toast.success('Group created. Invite people from the Members tab.');
            navigate(`/groups/${g.id}?tab=members`);
          }}
        />
      </Modal>
    </div>
  );
}

export default function Layout({ children }) {
  return (
    <GroupsProvider>
      <Shell>{children}</Shell>
    </GroupsProvider>
  );
}
