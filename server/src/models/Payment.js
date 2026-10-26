import mongoose from 'mongoose';

/**
 * An online payment between two group members, made through Razorpay.
 * Created when the payer opens checkout (status "created"); becomes "paid" only after
 * the server has verified Razorpay's signature, at which point a Settlement is recorded.
 */
const paymentSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 100 }, // paise (Razorpay minimum is ₹1)
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String },
    status: { type: String, enum: ['created', 'paid'], default: 'created' },
    paidVia: { type: String, enum: ['checkout', 'webhook', null], default: null },
    settlement: { type: mongoose.Schema.Types.ObjectId, ref: 'Settlement', default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ paymentId: 1 }, { unique: true, partialFilterExpression: { paymentId: { $type: 'string' } } });
paymentSchema.index({ group: 1, from: 1, createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
