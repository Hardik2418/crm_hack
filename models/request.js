// models/request.js
const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  // Legacy numeric ID (kept for backward compatibility)
  id: Number,

  // Auto-generated external order/lead ID, e.g. VH-20260326-0001
  orderId: {
    type: String,
    unique: true,
    sparse: true,
  },

  // Basic classification
  type: String,
  tag: String,

  // Lead details
  name: String, // Lead title or customer name short label
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  product: String,
  city: String,

  // Assignment
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Dates
  deadline: Date,
  nextFollowUpDate: Date,

  // Current status and history
  status: String,
  statusHistory: [
    {
      status: String,
      changedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
}, {
  timestamps: true,
});

const Request = mongoose.model('Request', requestSchema);

module.exports = Request;
