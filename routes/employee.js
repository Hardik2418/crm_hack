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

// Employee dashboard - focuses on assigned leads/requests
router.get('/dashboard', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const requests = await Request.find({ owner: user._id }).populate('owner', '_id name profileImage');

    const notifications = user.notifications || [];
    const unreadNotificationCount = notifications.filter((n) => !n.read).length;

    const total = requests.length;
    const open = requests.filter((r) => r.status === 'Open').length;
    const inProgress = requests.filter((r) => r.status === 'In Progress').length;
    const completed = requests.filter((r) => r.status === 'Resolved' || r.status === 'Closed').length;
    const stats = { total, open, inProgress, completed, overdue: 0 };

    // Simple status filter for the table view
    const statusFilter = req.query.status || 'All';
    let filteredRequests = requests;
    if (statusFilter === 'Open') {
      filteredRequests = requests.filter((r) => r.status === 'Open');
    } else if (statusFilter === 'In Progress') {
      filteredRequests = requests.filter((r) => r.status === 'In Progress');
    } else if (statusFilter === 'Completed') {
      filteredRequests = requests.filter((r) => r.status === 'Resolved' || r.status === 'Closed');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const overdueLeads = [];
    const todayLeads = [];
    const upcomingLeads = [];

    requests.forEach((r) => {
      if (!r.nextFollowUpDate) return;
      const d = new Date(r.nextFollowUpDate);
      const dMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (dMid < today) {
        overdueLeads.push(r);
      } else if (dMid.getTime() === today.getTime()) {
        todayLeads.push(r);
      } else if (dMid > today && dMid <= sevenDaysFromNow) {
        upcomingLeads.push(r);
      }
    });

    // Ensure the role shown in the UI matches the current session role
    if (req.session.user && req.session.user.role) {
      user.role = req.session.user.role;
    }

    res.render('employee-dashboard', {
      user,
      requests: filteredRequests,
      unreadNotificationCount,
      stats,
      overdueLeads,
      todayLeads,
      upcomingLeads,
      statusFilter,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Employee create request - assigns owner to the logged-in employee
router.get('/create', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/employee/dashboard');
    }
    const users = [user];
    res.render('create', { users, origin: 'employee' });
  } catch (error) {
    console.error(error);
    res.redirect('/employee/dashboard');
  }
});

router.post('/create', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/employee/dashboard');
    }

    const {
      type,
      name,
      tag,
      deadline,
      status,
      customerName,
      customerEmail,
      customerPhone,
      product,
      city,
      nextFollowUpDate,
    } = req.body;

    const existingRequests = await Request.find();
    const id = existingRequests.length + 1;
    const orderId = await generateOrderId();

    const request = new Request({
      id,
      orderId,
      type,
      name,
      tag,
      owner: user._id,
      deadline,
      status,
      customerName,
      customerEmail,
      customerPhone,
      product,
      city,
      nextFollowUpDate,
      statusHistory: [
        {
          status,
          changedAt: new Date(),
        },
      ],
    });

    await request.save();
    res.redirect('/employee/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Employee edit request (only their own)
router.get('/:id/edit', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/employee/dashboard');
    }

    const request = await Request.findOne({ _id: req.params.id, owner: user._id });
    if (!request) {
      return res.redirect('/employee/dashboard');
    }

    const users = [user];
    res.render('edit', { request, users, basePath: '/employee' });
  } catch (error) {
    console.error(error);
    res.redirect('/employee/dashboard');
  }
});

router.post('/:id/edit', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.redirect('/employee/dashboard');
    }

    const {
      type,
      name,
      tag,
      deadline,
      status,
      customerName,
      customerEmail,
      customerPhone,
      product,
      city,
      nextFollowUpDate,
    } = req.body;

    const request = await Request.findOne({ _id: req.params.id, owner: user._id });
    if (!request) {
      return res.redirect('/employee/dashboard');
    }

    const statusChanged = status && status !== request.status;

    request.type = type;
    request.name = name;
    request.tag = tag;
    request.owner = user._id;
    request.deadline = deadline;
    request.status = status;
    request.customerName = customerName;
    request.customerEmail = customerEmail;
    request.customerPhone = customerPhone;
    request.product = product;
    request.city = city;
    request.nextFollowUpDate = nextFollowUpDate;

    if (statusChanged) {
      request.statusHistory.push({ status, changedAt: new Date() });
    }

    await request.save();
    res.redirect('/employee/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
