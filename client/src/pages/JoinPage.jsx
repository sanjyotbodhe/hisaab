import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, FormError, Loading } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useGroups } from '../lib/groups.jsx';
import { useToast } from '../lib/toast.jsx';
import { useResource } from '../lib/useResource.js';

export default function JoinPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const groups = useGroups();
  const invite = useResource(() => api(`/invites/${encodeURIComponent(code)}`), [code]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`/invites/${encodeURIComponent(code)}/join`, { method: 'POST' });
      toast.success(res.joined ? 'You joined the group' : 'You are already in this group');
      groups.reload();
      navigate(`/groups/${res.groupId}`, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (invite.loading) return <Loading text="Checking invite…" />;
  if (invite.error) {
    return (
      <div className="narrow">
        <ErrorState error={invite.error} onRetry={invite.error.status === 0 ? invite.reload : undefined} />
        <p className="center">
          <Link to="/">Go to your groups</Link>
        </p>
      </div>
    );
  }
  const g = invite.data.group;
  return (
    <div className="narrow join">
      <p className="muted">You’ve been invited to</p>
      <h1>{g.name}</h1>
      {g.description && <p>{g.description}</p>}
      <p className="muted">
        {g.memberCount} member{g.memberCount === 1 ? '' : 's'}
      </p>
      <FormError error={error} />
      {g.alreadyMember ? (
        <Link className="btn btn-primary" to={`/groups/${g.id}`}>
          Open group
        </Link>
      ) : (
        <Button onClick={join} loading={busy}>
          Join group
        </Button>
      )}
    </div>
  );
}
