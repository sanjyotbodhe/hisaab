import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CreateGroupForm from '../components/CreateGroupForm.jsx';
import InsightsCarousel, { buildInsights } from '../components/dashboard/InsightsCarousel.jsx';
import { ComingUp, RecentActivity, SpendingPanel } from '../components/dashboard/Panels.jsx';
import { Icon } from '../components/icons.jsx';
import { Button, Empty, ErrorState, Loading, Modal } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { formatINR, timeAgo } from '../lib/format.js';
import { useGroups, useOverview } from '../lib/groups.jsx';
import { useToast } from '../lib/toast.jsx';

/** Accepts a bare code or a full invite link pasted from chat. */
function parseInvite(input) {
  const s = input.trim();
  const m = /\/join\/([A-Za-z0-9]+)/.exec(s);
  return (m ? m[1] : s).toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function MiniStat({ label, paise, tone, icon }) {
  return (
    <div className="mini-stat">
      <span className={`mini-icon ${tone}`} aria-hidden="true">
        <Icon name={icon} size={17} />
      </span>
      <div>
        <span className="stat-label">{label}</span>
        <strong className={paise ? tone : 'muted'}>{formatINR(paise)}</strong>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const groups = useGroups();
  const overview = useOverview();
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  // Refresh balances whenever the overview is opened (the sidebar keeps the list between pages).
  useEffect(() => {
    if (groups.data) groups.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (groups.loading && !groups.data) return <Loading text="Loading your groups…" />;
  if (groups.error && !groups.data) return <ErrorState error={groups.error} onRetry={groups.reload} />;

  const list = groups.data.groups;
  const owed = list.filter((g) => g.myBalance > 0).reduce((a, g) => a + g.myBalance, 0);
  const owe = list.filter((g) => g.myBalance < 0).reduce((a, g) => a - g.myBalance, 0);
  const net = owed - owe;
  const openGroups = list.filter((g) => g.myBalance !== 0).length;

  function quickAdd() {
    if (list.length === 1) navigate(`/groups/${list[0].id}?add=1`);
    else setPicking(true);
  }

  function joinByCode(e) {
    e.preventDefault();
    const c = parseInvite(code);
    if (!/^[A-Z0-9]{6,20}$/.test(c)) return setCodeError('Paste an invite link or code');
    navigate(`/join/${c}`);
  }

  return (
    <div className="dashboard">
      <header className="page-head">
        <div>
          <p className="eyebrow-date">
            {new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
          </p>
          <h1>
            {greeting()}, {user.name.split(' ')[0]}
          </h1>
        </div>
        <div className="head-actions">
          <Button className="btn-ghost" onClick={() => setCreating(true)}>
            <Icon name="users" size={16} /> New group
          </Button>
          {list.length > 0 && (
            <Button onClick={quickAdd}>
              <Icon name="plus" size={16} /> Add expense
            </Button>
          )}
        </div>
      </header>

      <div className="dash-grid">
        <div className="dash-main">
          <section className="stats balance-hero" aria-label="Your totals">
            <div className="balance-hero-top">
              <span className="stat-label">Net position</span>
              <span className="balance-hero-value">
                {net < 0 ? '−' : ''}
                {formatINR(Math.abs(net))}
              </span>
              <span className="stat-note">
                {net === 0
                  ? 'All square everywhere'
                  : `${net > 0 ? 'Ahead' : 'Behind'} across ${openGroups} group${openGroups === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className="balance-split">
              <MiniStat label="You are owed" paise={owed} tone="pos" icon="arrowDownLeft" />
              <MiniStat label="You owe" paise={owe} tone="neg" icon="arrowUpRight" />
            </div>
          </section>

          {overview.data && <InsightsCarousel cards={buildInsights(overview.data, list)} />}
          {overview.data && list.length > 0 && <SpendingPanel overview={overview.data} />}

          <section>
            <div className="section-head">
              <h2>Your groups</h2>
            </div>
            {list.length === 0 ? (
              <Empty
                title="Start your first group"
                action={
                  <Button onClick={() => setCreating(true)}>
                    <Icon name="plus" size={16} /> Create a group
                  </Button>
                }
              >
                One group per flat, trip or dinner club. Share its invite link and everyone adds what they paid.
              </Empty>
            ) : (
              <ul className="group-grid">
                {list.map((g) => (
                  <li key={g.id}>
                    <Link to={`/groups/${g.id}`} className="group-card">
                      <span className="group-card-top">
                        <span className="group-initial" aria-hidden="true">
                          {g.name.trim()[0]?.toUpperCase()}
                        </span>
                        <span className="group-card-title">
                          <span className="group-card-name">{g.name}</span>
                          <span className="muted small">
                            <Icon name="users" size={13} /> {g.memberCount} · {timeAgo(g.updatedAt)}
                          </span>
                        </span>
                      </span>
                      <span className={`group-card-bal ${g.myBalance > 0 ? 'pos' : g.myBalance < 0 ? 'neg' : 'zero'}`}>
                        <span className="small">
                          {g.myBalance > 0 ? 'you get back' : g.myBalance < 0 ? 'you owe' : 'settled up'}
                        </span>
                        {g.myBalance !== 0 && <span className="hand">{formatINR(Math.abs(g.myBalance))}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="dash-side" aria-label="Coming up and activity">
          {overview.data && <ComingUp items={overview.data.upcoming} />}
          {overview.data && <RecentActivity items={overview.data.activity} meId={user.id} />}
          {overview.loading && !overview.data && <Loading text="Crunching your numbers…" />}
          {overview.error && !overview.data && (
            <p className="muted small">Couldn’t load insights right now. Your balances above are up to date.</p>
          )}
          <section className="join-card">
            <div>
              <h2>Got an invite?</h2>
              <p className="muted small">Paste the link a friend sent you, or just the code.</p>
            </div>
            <form onSubmit={joinByCode} className="inline-form" noValidate>
              <input
                aria-label="Invite link or code"
                placeholder="https://…/#/join/ABCD234XYZ"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError('');
                }}
              />
              <button className="btn btn-secondary" type="submit">
                Open invite
              </button>
            </form>
            {codeError && <p className="field-error">{codeError}</p>}
          </section>
        </aside>
      </div>

      <Modal open={picking} onClose={() => setPicking(false)} title="Add an expense to…">
        <ul className="pick-list">
          {list.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                className="pick-row"
                onClick={() => {
                  setPicking(false);
                  navigate(`/groups/${g.id}?add=1`);
                }}
              >
                <span className="group-initial" aria-hidden="true">
                  {g.name.trim()[0]?.toUpperCase()}
                </span>
                <span className="pick-name">{g.name}</span>
                <span className="muted small">
                  {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
                </span>
                <Icon name="arrowRight" size={16} />
              </button>
            </li>
          ))}
        </ul>
      </Modal>

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
