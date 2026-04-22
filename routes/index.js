const express = require('express');
const router = express.Router();

// Default page - login
router.get('/', (req, res) => {
  res.render('login');
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

module.exports = router;
