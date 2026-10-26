import mongoose from 'mongoose';

export const PLAN_KINDS = ['place', 'activity', 'food', 'transport', 'stay', 'note'];

const placeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 160, required: true },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    lat: { type: Number, min: -90, max: 90, required: true },
    lng: { type: Number, min: -180, max: 180, required: true },
    thumbnail: { type: String, maxlength: 500, default: '' },
    url: { type: String, maxlength: 500, default: '' }, // e.g. Wikipedia article
  },
  { _id: false },
);

/**
 * One entry in a group's trip plan. Without a day it is an "idea" the group can vote
 * on; with a day it is part of the day-by-day itinerary.
 */
const planItemSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    title: { type: String, trim: true, maxlength: 120, required: true },
    kind: { type: String, enum: PLAN_KINDS, default: 'place' },
    day: { type: Date, default: null }, // calendar date (UTC midnight) or null = idea
    time: { type: String, default: '' }, // "HH:MM" or ''
    place: { type: placeSchema, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    votes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

planItemSchema.index({ group: 1, day: 1, time: 1 });

export const PlanItem = mongoose.model('PlanItem', planItemSchema);
