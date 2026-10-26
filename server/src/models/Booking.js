import mongoose from 'mongoose';

export const BOOKING_TYPES = ['flight', 'train', 'bus', 'hotel', 'activity', 'other'];

/**
 * A confirmation the group needs to find quickly: PNR, hotel booking, tickets.
 * Optionally turned into a shared expense exactly once (see `expense`).
 */
const bookingSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    type: { type: String, enum: BOOKING_TYPES, required: true },
    title: { type: String, trim: true, maxlength: 120, required: true },
    provider: { type: String, trim: true, maxlength: 80, default: '' },
    reference: { type: String, trim: true, maxlength: 60, default: '' }, // PNR / confirmation no.
    startDate: { type: Date, default: null },
    startTime: { type: String, default: '' },
    endDate: { type: Date, default: null },
    endTime: { type: String, default: '' },
    location: { type: String, trim: true, maxlength: 160, default: '' },
    cost: { type: Number, min: 0, default: 0 }, // paise, 0 = unknown / free
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

bookingSchema.index({ group: 1, startDate: 1 });

export const Booking = mongoose.model('Booking', bookingSchema);
