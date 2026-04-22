// middleware.js

// Middleware function to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.authenticated && req.session.user) {
      return next();
    }
    res.redirect('/');
  };

// Middleware to enforce role-based access
const requireRole = (roles) => (req, res, next) => {
  if (!req.session || !req.session.user || !roles.includes(req.session.user.role)) {
    return res.status(403).send('Forbidden');
  }
  next();
};
  
  module.exports = { isAuthenticated, requireRole };
  