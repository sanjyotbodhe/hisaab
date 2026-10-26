import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    // Never returned by default; only loaded explicitly for login.
    passwordHash: { type: String, required: true, select: false },
    // Optional UPI ID (e.g. name@okaxis) so group members can pay this person in one tap.
    upiId: { type: String, trim: true, maxlength: 100, default: '' },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, email: this.email, upiId: this.upiId || '' };
};

export const User = mongoose.model('User', userSchema);
