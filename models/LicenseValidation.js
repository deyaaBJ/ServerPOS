const mongoose = require('mongoose');

const licenseValidationSchema = new mongoose.Schema({
  licenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'License',
    required: true,
    index: true
  },
  deviceBindingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeviceBinding',
    default: null,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    trim: true
  },
  outcome: {
    type: String,
    enum: ['success', 'rejected', 'revoked', 'expired', 'suspicious', 'invalid'],
    required: true,
    index: true
  },
  reasonCode: {
    type: String,
    default: null,
    index: true
  },
  tokenKid: {
    type: String,
    default: null
  },
  tokenVersion: {
    type: Number,
    default: null
  },
  nonce: {
    type: String,
    default: null
  },
  rollingValidationId: {
    type: String,
    default: null
  },
  validatedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipHash: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: false
});

licenseValidationSchema.index({ licenseId: 1, validatedAt: -1 });
licenseValidationSchema.index({ deviceId: 1, validatedAt: -1 });

module.exports = mongoose.model('LicenseValidation', licenseValidationSchema);
