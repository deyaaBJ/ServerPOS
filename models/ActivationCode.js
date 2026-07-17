const mongoose = require('mongoose');
const { normalizeCode } = require('../utils/code');

const activationCodeSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: [true, 'Code is required'],
    uppercase: true,
    trim: true,
    minlength: [3, 'Code must be at least 3 characters'],
    maxlength: [50, 'Code cannot exceed 50 characters']
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ActivationRequest',
    default: null,
    index: true
  },
  used: { 
    type: Boolean, 
    default: false,
    index: true
  },
  deviceId: { 
    type: String, 
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active',
    index: true
  },
  expiresAt: {
    type: Date,
    default: null,
    index: true
  },
  lastValidatedAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  },
  activatedAt: { 
    type: Date, 
    default: null 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  }
}, {
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
activationCodeSchema.index({ deviceId: 1, used: 1 });
activationCodeSchema.index({ requestId: 1, deviceId: 1 });

// Virtual for status text
activationCodeSchema.virtual('statusText').get(function() {
  return this.used ? 'مفعل' : 'متاح';
});

// Method to check if code is available
activationCodeSchema.methods.isAvailable = function() {
  return !this.used;
};

// Static method to find by code (case insensitive)
activationCodeSchema.statics.findByCode = function(code) {
  return this.findOne({ code: normalizeCode(code) }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('ActivationCode', activationCodeSchema);
