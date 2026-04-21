const mongoose = require('mongoose');

const activationRequestSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: [true, 'Device ID is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'deactivated'],
    default: 'pending'
  },
  assignedCode: {
    type: String,
    default: null,
    uppercase: true,
    trim: true
  },
  approvedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null,
    trim: true,
    maxlength: [250, 'Rejection reason cannot exceed 250 characters']
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false
});

activationRequestSchema.index({ deviceId: 1, status: 1 });

activationRequestSchema.pre('save', function() {
  this.updatedAt = new Date();
});

activationRequestSchema.statics.findActiveForDevice = function(deviceId) {
  return this.findOne({
    deviceId: deviceId.trim(),
    status: { $in: ['pending', 'approved'] }
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('ActivationRequest', activationRequestSchema);
