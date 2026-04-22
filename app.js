const dotenv = require('dotenv');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notification');
const employeeRoutes = require('./routes/employee');
const clientRoutes = require('./routes/client');

const { isAuthenticated, requireRole } = require('./middleware');

const User = require('./models/user');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Session-based authentication

// Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
  })
);


// Routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/notifications', isAuthenticated, notificationRoutes);

// Role-based dashboards
app.use('/dashboard', isAuthenticated, requireRole(['admin']), dashboardRoutes);
app.use('/employee', isAuthenticated, requireRole(['employee']), employeeRoutes);
app.use('/client', isAuthenticated, requireRole(['client']), clientRoutes);


// Start the server
const BASE_PORT = Number(process.env.PORT || 3000);

const startServer = (port) => {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.log(`Port ${port} is busy, trying ${nextPort}...`);
      server.close(() => startServer(nextPort));
      return;
    }

    console.error('Server error:', error);
    process.exit(1);
  });
};

startServer(BASE_PORT);
