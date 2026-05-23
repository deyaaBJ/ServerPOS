const mongoose = require('mongoose');

const deviceBindingSchema = new mongoose.Schema({
  licenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'License',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  fingerprintHash: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'suspicious', 'requires_manual_review', 'device_changed', 'revoked'],
    default: 'active',
    index: true
  },
  firstActivationAt: {
    type: Date,
    default: Date.now
  },
  lastValidationAt: {
    type: Date,
    default: null
  },
  validationCount: {
    type: Number,
    default: 0
  },
  firstSeenIpHash: {
    type: String,
    default: null
  },
  lastSeenIpHash: {
    type: String,
    default: null
  },
  lastIpPrefix: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

deviceBindingSchema.index({ licenseId: 1, deviceId: 1 }, { unique: true });
deviceBindingSchema.index({ licenseId: 1, fingerprintHash: 1 });

module.exports = mongoose.model('DeviceBinding', deviceBindingSchema);
