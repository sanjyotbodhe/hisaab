import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useResource } from './useResource.js';

const GroupsContext = createContext(null);
const OverviewContext = createContext(null);

/**
 * The signed-in user's groups (with their balance in each), shared by the sidebar and dashboard,
 * plus their cross-group overview (spending, what's coming up, recent activity).
 * The overview reloads whenever the group list does, so it follows every change.
 */
export function GroupsProvider({ children }) {
  const groups = useResource(() => api('/groups'), []);
  const overview = useOverviewFollowing(groups.data);
  return (
    <GroupsContext.Provider value={groups}>
      <OverviewContext.Provider value={overview}>{children}</OverviewContext.Provider>
    </GroupsContext.Provider>
  );
}

function useOverviewFollowing(trigger) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const reqId = useRef(0);
  useEffect(() => {
    if (!trigger) return;
    const id = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    api('/me/overview').then(
      (data) => id === reqId.current && setState({ data, error: null, loading: false }),
      (error) => id === reqId.current && setState((s) => ({ ...s, error, loading: false })),
    );
  }, [trigger]);
  return state;
}

export const useGroups = () => useContext(GroupsContext);
export const useOverview = () => useContext(OverviewContext);
