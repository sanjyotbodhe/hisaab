import { createContext, useContext } from 'react';
import { api } from './api.js';
import { useResource } from './useResource.js';

const GroupsContext = createContext(null);

/** The signed-in user's groups (with their balance in each), shared by the sidebar and dashboard. */
export function GroupsProvider({ children }) {
  const groups = useResource(() => api('/groups'), []);
  return <GroupsContext.Provider value={groups}>{children}</GroupsContext.Provider>;
}

export const useGroups = () => useContext(GroupsContext);
