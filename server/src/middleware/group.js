import { Group } from '../models/Group.js';
import { forbidden, notFound } from '../utils/errors.js';

/**
 * Loads :groupId and checks the current user belongs to it.
 * Non-members get 404 (not 403) so group ids can't be probed for existence.
 */
export async function loadGroupMember(req, res, next) {
  const { groupId } = req.params;
  if (!/^[a-f\d]{24}$/i.test(groupId)) return next(notFound('Group'));
  const group = await Group.findById(groupId);
  if (!group) return next(notFound('Group'));
  const membership = group.memberOf(req.user._id);
  if (!membership) return next(notFound('Group'));
  req.group = group;
  req.membership = membership;
  next();
}

export function requireGroupAdmin(req, res, next) {
  if (req.membership?.role !== 'admin') return next(forbidden('Only group admins can do that'));
  next();
}
