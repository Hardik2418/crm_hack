const express = require('express');
const router = express.Router();
const Request = require('../models/request');
const User = require('../models/user');

// Helper: generate order ID like VH-YYYYMMDD-0001
async function generateOrderId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;
  const prefix = `VH-${datePart}-`;

  const countForToday = await Request.countDocuments({ orderId: { $regex: `^${prefix}` } });
  const nextNumber = String(countForToday + 1).padStart(4, '0');
  return `${prefix}${nextNumber}`;
}

// Client dashboard - shows requests in a client-friendly view
router.get('/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const { status, from, to } = req.query;

    const baseFilter = {};

    if (status && status !== 'All') {
      baseFilter.status = status;
    }

    if (from || to) {
      baseFilter.createdAt = {};
      if (from) {
        baseFilter.createdAt.$gte = new Date(from);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        baseFilter.createdAt.$lte = toDate;
      }
    }

    const allRequests = await Request.find().populate('owner', '_id name profileImage');
    const requests = Object.keys(baseFilter).length
      ? await Request.find(baseFilter).populate('owner', '_id name profileImage')
      : allRequests;

    const notifications = user.notifications || [];
    const unreadNotificationCount = notifications.filter((n) => !n.read).length;

    const stats = {
      total: allRequests.length,
      open: allRequests.filter((r) => r.status === 'Open').length,
      inProgress: allRequests.filter((r) => r.status === 'In Progress').length,
      completed: allRequests.filter((r) => r.status === 'Resolved' || r.status === 'Closed').length,
      overdue: 0,
    };

    const activity = allRequests
      .slice()
      .sort((a, b) => {
        const aTime = a.updatedAt || a.createdAt || 0;
        const bTime = b.updatedAt || b.createdAt || 0;
        return bTime - aTime;
      })
      .slice(0, 6);

    // Align displayed role with the session role for the client dashboard
    if (req.session.user && req.session.user.role) {
      user.role = req.session.user.role;
    }

    res.render('client-dashboard', {
      user,
      requests,
      unreadNotificationCount,
      stats,
      activity,
      filters: {
        status: status || 'All',
        from: from || '',
        to: to || '',
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// NOTE: Clients are read-only; creation, editing, and deletion of
// requests are reserved for admins. These routes are intentionally
// disabled to prevent modifications from the client area.

router.get('/create', async (req, res) => {
  return res.redirect('/client/dashboard');
});

router.post('/create', async (req, res) => {
  return res.status(403).send('Forbidden');
});

router.get('/:id/edit', async (req, res) => {
  return res.redirect('/client/dashboard');
});

router.post('/:id/edit', async (req, res) => {
  return res.status(403).send('Forbidden');
});

router.post('/:id/delete', async (req, res) => {
  return res.status(403).send('Forbidden');
});

module.exports = router;
