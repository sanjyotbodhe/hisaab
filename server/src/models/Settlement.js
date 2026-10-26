import mongoose from 'mongoose';

/** A real-world payment: `from` paid `to` some money to clear (part of) a debt. */
const settlementSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 1 }, // paise
    note: { type: String, trim: true, maxlength: 200, default: '' },
    date: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    clientRequestId: { type: String },
  },
  { timestamps: true },
);

settlementSchema.index({ group: 1, deletedAt: 1, date: -1 });
settlementSchema.index(
  { group: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
);

export const Settlement = mongoose.model('Settlement', settlementSchema);
