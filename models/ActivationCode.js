const mongoose = require('mongoose');

const activationCodeSchema = new mongoose.Schema({
  code: { 
    type: String, 
    required: [true, 'Code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: [3, 'Code must be at least 3 characters'],
    maxlength: [50, 'Code cannot exceed 50 characters']
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
activationCodeSchema.index({ code: 1, used: 1 });
activationCodeSchema.index({ deviceId: 1, used: 1 });

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
  return this.findOne({ code: code.toUpperCase().trim() });
};

module.exports = mongoose.model('ActivationCode', activationCodeSchema);