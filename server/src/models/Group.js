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

/** Optional trip details: turns a group into a shared trip plan. */
const tripSchema = new mongoose.Schema(
  {
    destination: {
      type: new mongoose.Schema(
        {
          name: { type: String, trim: true, maxlength: 120, required: true },
          lat: { type: Number, min: -90, max: 90, required: true },
          lng: { type: Number, min: -180, max: 180, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    budget: { type: Number, min: 0, default: 0 }, // paise, 0 = no budget
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
    trip: { type: tripSchema, default: () => ({}) },
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
