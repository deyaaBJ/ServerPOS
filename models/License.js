const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActivationRequest',
    default: null,
    index: true
  },
  type: {
    type: String,
    enum: ['permanent', 'temporary'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked', 'suspicious', 'requires_manual_review', 'device_changed'],
    default: 'active',
    index: true
  },
  features: {
    type: [String],
    default: []
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  lastValidatedAt: {
    type: Date,
    default: null,
    index: true
  },
  lastIssuedAt: {
    type: Date,
    default: null
  },
  lastTokenNonce: {
    type: String,
    default: null
  },
  tokenVersion: {
    type: Number,
    default: 1
  },
  revalidationIntervalSeconds: {
    type: Number,
    required: true
  },
  offlineGraceSeconds: {
    type: Number,
    required: true
  },
  clockSkewToleranceSeconds: {
    type: Number,
    default: 300
  },
  maxDevices: {
    type: Number,
    default: 1
  },
  validationCount: {
    type: Number,
    default: 0
  },
  firstActivatedAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null,
    index: true
  },
  revokedReason: {
    type: String,
    default: null
  },
  revokedBy: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

licenseSchema.index({ code: 1 }, { unique: true });
licenseSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('License', licenseSchema);
