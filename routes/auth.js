const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const router = express.Router();

// Login / Register route - handles form submission
router.post('/login', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).render('login', { error: 'Name, email, password, and role are required' });
    }

    const normalizedRole = ['admin', 'employee', 'client'].includes(role) ? role : 'client';

    let user = await User.findOne({ email });

    if (!user) {
      // NEW USER: Create account with hashed password and selected role
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        user = await User.create({ name, email, password: hashedPassword, role: normalizedRole });
      } catch (dbError) {
        if (dbError.code === 11000) {
          return res.status(400).render('login', { error: 'Email already registered' });
        }
        throw dbError;
      }
    } else {
      // EXISTING USER: Verify password
      if (!user.password) {
        // Legacy user without password - set one now
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        await user.save();
      } else {
        // User exists with password - verify it
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).render('login', { error: 'Invalid email or password' });
        }
      }
    }

    // Store minimal user info in session
    req.session.userId = user._id;
    req.session.user = {
      _id: user._id,
      name: user.name,
      role: user.role,
    };
    req.session.authenticated = true;

    // Redirect based on role
    let redirectUrl = '/dashboard';
    if (user.role === 'employee') {
      redirectUrl = '/employee/dashboard';
    } else if (user.role === 'client') {
      redirectUrl = '/client/dashboard';
    }

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('login', { error: 'Login failed. Please try again.' });
  }
});

module.exports = router;

