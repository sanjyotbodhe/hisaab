import { Router } from 'express';
import { Group } from '../models/Group.js';
import { userOverview } from '../services/overview.js';
import { processDueRecurring } from '../services/recurring.js';

const router = Router();

/** The dashboard's numbers for the signed-in user, across every group they belong to. */
router.get('/overview', async (req, res) => {
  const groups = await Group.find({ 'members.user': req.user._id }, { _id: 1 }).lean();
  try {
    // Due recurring expenses count towards "this month", so add them first.
    await processDueRecurring({ groupIds: groups.map((g) => g._id) });
  } catch (err) {
    console.error('[recurring] catch-up on overview failed:', err.message);
  }
  res.json(await userOverview(req.user));
});

export default router;
