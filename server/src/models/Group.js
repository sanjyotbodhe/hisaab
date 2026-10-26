import crypto from 'node:crypto';
import mongoose from 'mongoose';

export const ROLES = ['admin', 'member'];

/** 10 chars from an unambiguous alphabet (~50 bits): unguessable for invite links. */
export function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ROLES, default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    members: { type: [memberSchema], default: [] },
    inviteCode: { type: String, required: true, unique: true, default: generateInviteCode },
    simplifyDebts: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

groupSchema.index({ 'members.user': 1 });

groupSchema.methods.memberOf = function memberOf(userId) {
  const id = String(userId);
  return this.members.find((m) => String(m.user?._id ?? m.user) === id) || null;
};

export const Group = mongoose.model('Group', groupSchema);
