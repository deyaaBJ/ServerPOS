const mongoose = require('mongoose');

const licenseAuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['activate', 'validate', 'check-device', 'revoke', 'status', 'refresh-token']
  },
  outcome: {
    type: String,
    required: true,
    enum: ['success', 'rejected', 'error']
  },
  code: {
    type: String,
    default: null,
    uppercase: true,
    trim: true
  },
  deviceId: {
    type: String,
    default: null,
    trim: true
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActivationRequest',
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  ipPrefix: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  reason: {
    type: String,
    default: null,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false
});

licenseAuditLogSchema.index({ code: 1, createdAt: -1 });
licenseAuditLogSchema.index({ deviceId: 1, createdAt: -1 });
licenseAuditLogSchema.index({ requestId: 1, createdAt: -1 });

module.exports = mongoose.model('LicenseAuditLog', licenseAuditLogSchema);
