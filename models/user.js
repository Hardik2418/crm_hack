// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  role: {
    type: String,
    enum: ['admin', 'employee', 'client'],
    default: 'client',
  },
  profileImage: String,
  notifications: [
    {
      message: { type: String, required: true },
      type: { type: String, required: true },
      read: { type: Boolean, default: false },
      data: {
        requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
      },
    },
  ],
});

module.exports = mongoose.model('User', userSchema);
