import mongoose from 'mongoose';

export const ACTIVITY_TYPES = [
  'group.created',
  'group.updated',
  'member.joined',
  'member.left',
  'member.removed',
  'member.role_changed',
  'invite.regenerated',
  'expense.created',
  'expense.updated',
  'expense.deleted',
  'settlement.created',
  'settlement.deleted',
  'recurring.created',
  'recurring.paused',
  'recurring.resumed',
  'recurring.deleted',
  'recurring.auto_paused',
  'trip.updated',
  'plan.added',
  'plan.scheduled',
  'plan.removed',
  'booking.added',
  'booking.removed',
  'booking.expensed',
  'payment.received',
];

/** Append-only audit log of everything that happens in a group. */
const activitySchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null = system (scheduler)
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    // Snapshot of the interesting bits so the feed still reads correctly after edits/deletes.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activitySchema.index({ group: 1, createdAt: -1 });

export const Activity = mongoose.model('Activity', activitySchema);
