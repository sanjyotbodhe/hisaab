import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { Group } from '../models/Group.js';
import { logActivity } from '../services/activity.js';
import { AppError } from '../utils/errors.js';

const router = Router();

const codeParams = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,20}$/, 'Invalid invite code'),
});

const invalidInvite = () =>
  new AppError(404, 'INVALID_INVITE', 'This invite link is invalid or has been reset by the group admin');

// Preview the group behind an invite before joining.
router.get('/:code', validate({ params: codeParams }), async (req, res) => {
  const group = await Group.findOne({ inviteCode: req.valid.params.code });
  if (!group) throw invalidInvite();
  res.json({
    group: {
      id: String(group._id),
      name: group.name,
      description: group.description,
      memberCount: group.members.length,
      alreadyMember: Boolean(group.memberOf(req.user._id)),
    },
  });
});

router.post('/:code/join', validate({ params: codeParams }), async (req, res) => {
  const code = req.valid.params.code;
  // Single atomic update: the "not already a member" check and the insert happen
  // together, so double-clicking Join can never add the same person twice.
  const group = await Group.findOneAndUpdate(
    { inviteCode: code, 'members.user': { $ne: req.user._id } },
    { $push: { members: { user: req.user._id, role: 'member', joinedAt: new Date() } } },
    { new: true },
  );
  if (group) {
    await logActivity(group, req.user, 'member.joined', { name: req.user.name });
    return res.json({ groupId: String(group._id), joined: true });
  }
  const existing = await Group.findOne({ inviteCode: code });
  if (!existing) throw invalidInvite();
  res.json({ groupId: String(existing._id), joined: false }); // already a member
});

export default router;
