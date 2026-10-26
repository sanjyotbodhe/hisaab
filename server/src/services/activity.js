import { Activity } from '../models/Activity.js';

/**
 * Activity is a side record: if writing it fails we log and carry on rather than
 * failing the user's (already committed) action.
 */
export async function logActivity(group, actor, type, meta = {}) {
  try {
    await Activity.create({ group: group._id ?? group, actor: actor?._id ?? actor ?? null, type, meta });
  } catch (err) {
    console.error('[activity] failed to record', type, err.message);
  }
}
