import mongoose from 'mongoose';
import { SPLIT_TYPES } from '../shared/split.js';
import { CATEGORIES } from './Expense.js';

export const FREQUENCIES = ['weekly', 'monthly'];

/** A rule like "Rent ₹30,000, paid by Asha, split equally, every month on the 1st". */
const recurringSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    description: { type: String, required: true, trim: true, maxlength: 100 },
    amount: { type: Number, required: true, min: 1 },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    splitType: { type: String, enum: SPLIT_TYPES, required: true },
    participants: {
      type: [
        new mongoose.Schema(
          {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            value: { type: mongoose.Schema.Types.Mixed, default: null },
          },
          { _id: false },
        ),
      ],
      required: true,
    },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    frequency: { type: String, enum: FREQUENCIES, required: true },
    // Day-of-month the rule was anchored to (1-31). Keeps "31st" rules on the
    // last day of short months instead of drifting to the 28th forever.
    anchorDay: { type: Number, min: 1, max: 31 },
    nextRunAt: { type: Date, required: true },
    lastRunAt: { type: Date },
    active: { type: Boolean, default: true },
    pausedReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

recurringSchema.index({ active: 1, nextRunAt: 1 });
recurringSchema.index({ group: 1 });

export const RecurringExpense = mongoose.model('RecurringExpense', recurringSchema);
