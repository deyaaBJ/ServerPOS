const mongoose = require('mongoose');

const revocationSchema = new mongoose.Schema({
  licenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'License',
    required: true,
    index: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  revokedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  revokedBy: {
    type: String,
    default: 'system',
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: false
});

revocationSchema.index({ licenseId: 1, revokedAt: -1 });

module.exports = mongoose.model('Revocation', revocationSchema);
