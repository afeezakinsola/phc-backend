const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'doctor', 'nurse'], required: true },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true },
  staffId: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
}, { timestamps: true });

userSchema.index({ hospital: 1, staffId: 1 }, { unique: true });
module.exports = mongoose.model('User', userSchema);
