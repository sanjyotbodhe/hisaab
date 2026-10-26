import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    // Never returned by default; only loaded explicitly for login.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, email: this.email };
};

export const User = mongoose.model('User', userSchema);
