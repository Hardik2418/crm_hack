const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Request = require('../models/request');
const User = require('../models/user');
const { isAuthenticated } = require('../middleware');

const upload = multer({ dest: path.join(__dirname, '../uploads') });

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


// List all requests & load Notifications

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const users = await User.find({}, '_id name profileImage');
    let requests;

    if (req.query.q) {
      // If there's a search query, perform a case-insensitive search on the 'name' field
      requests = await Request.find({ name: { $regex: new RegExp(req.query.q, 'i') } }).populate('owner', '_id name profileImage');
    } else {
      // If there's no search query, list all requests
      requests = await Request.find().populate('owner', '_id name profileImage');
    }

    const notifications = user.notifications;
    // Fetch notifications for the user
    const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

    // Simple stats for dashboard cards
    const totalRequests = requests.length;
    const openRequests = requests.filter((r) => r.status === 'Open').length;
    const inProgressRequests = requests.filter((r) => r.status === 'In Progress').length;
    const completedRequests = requests.filter((r) => r.status === 'Resolved' || r.status === 'Closed').length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const overdueRequests = requests.filter((r) => {
      if (!r.deadline) return false;
      const deadlineDate = new Date(r.deadline);
      return deadlineDate < today && r.status !== 'Resolved' && r.status !== 'Closed';
    }).length;

    const stats = {
      total: totalRequests,
      open: openRequests,
      inProgress: inProgressRequests,
      completed: completedRequests,
      overdue: overdueRequests,
    };

    // Follow-up buckets based on nextFollowUpDate
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

    // Simple performance metrics per owner
    const performanceMap = {};
    requests.forEach((r) => {
      if (!r.owner) return;
      const ownerId = String(r.owner._id || r.owner);
      if (!performanceMap[ownerId]) {
        const u = users.find((u) => String(u._id) === ownerId);
        performanceMap[ownerId] = {
          ownerId,
          ownerName: u ? u.name : 'Unknown',
          total: 0,
          completed: 0,
        };
      }
      performanceMap[ownerId].total += 1;
      if (r.status === 'Resolved' || r.status === 'Closed') {
        performanceMap[ownerId].completed += 1;
      }
    });

    const performance = Object.values(performanceMap).map((p) => ({
      ...p,
      conversionRate: p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0,
    }));

    res.render('dashboard', {
      user,
      requests,
      users,
      unreadNotificationCount,
      stats,
      overdueLeads,
      todayLeads,
      upcomingLeads,
      performance,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Simple Kanban-style board grouped by status
router.get('/board', isAuthenticated, async (req, res) => {
  try {
    const requests = await Request.find().populate('owner', '_id name');

    const columns = {
      open: [],
      inProgress: [],
      resolved: [],
      closed: [],
    };

    requests.forEach((r) => {
      const card = r;
      if (r.status === 'Open') columns.open.push(card);
      else if (r.status === 'In Progress') columns.inProgress.push(card);
      else if (r.status === 'Resolved') columns.resolved.push(card);
      else if (r.status === 'Closed') columns.closed.push(card);
      else columns.open.push(card);
    });

    res.render('board', { columns });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});


// Create a new request (admin)
router.get('/create', isAuthenticated, async (req, res) => {
  try {
    const users = await User.find({}, '_id name');
    res.render('create', { users, origin: 'admin' });
  } catch (error) {
    console.error(error);
    res.redirect('/dashboard');
  }
});


router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const {
      type,
      name,
      tag,
      owner,
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
      owner,
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

    // Create a notification for the owner
    const ownerUser = await User.findById(owner);
    if (ownerUser) {
      ownerUser.notifications.push({
        message: `You have been assigned a new ${type}: ${name}`,
        type: 'request',
        data: {
          requestId: request._id,
        },
      });
      await ownerUser.save();
    }

    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Edit a request

router.get('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.redirect('/dashboard');
    }
    const users = await User.find({}, '_id name');
    res.render('edit', { request, users, basePath: '/dashboard' });
  } catch (error) {
    console.error(error);
    res.redirect('/dashboard');
  }
});

router.post('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const {
      type,
      name,
      tag,
      owner,
      deadline,
      status,
      customerName,
      customerEmail,
      customerPhone,
      product,
      city,
      nextFollowUpDate,
    } = req.body;

    const request = await Request.findById(req.params.id);
    if (!request) {
      return res.redirect('/dashboard');
    }

    const statusChanged = status && status !== request.status;

    request.type = type;
    request.name = name;
    request.tag = tag;
    request.owner = owner;
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

    // Notify owner that the request was updated
    const ownerUser = await User.findById(request.owner);
    if (ownerUser) {
      ownerUser.notifications = ownerUser.notifications || [];
      ownerUser.notifications.push({
        message: `Request ${request.orderId || request.id} has been updated`,
        type: 'request-update',
        data: {
          requestId: request._id,
        },
      });
      await ownerUser.save();
    }

    // Also notify the user who performed the update
    const actorUser = await User.findById(req.session.userId);
    if (actorUser && (!ownerUser || String(actorUser._id) !== String(ownerUser._id))) {
      actorUser.notifications = actorUser.notifications || [];
      actorUser.notifications.push({
        message: `You updated request ${request.orderId || request.id}`,
        type: 'request-update-self',
        data: {
          requestId: request._id,
        },
      });
      await actorUser.save();
    }
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Delete a request
router.post('/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (request) {
      // Notify owner that the request was deleted
      const ownerUser = await User.findById(request.owner);
      if (ownerUser) {
        ownerUser.notifications = ownerUser.notifications || [];
        ownerUser.notifications.push({
          message: `Request ${request.orderId || request.id} has been deleted`,
          type: 'request-delete',
          data: {
            requestId: request._id,
          },
        });
        await ownerUser.save();
      }

      // Also notify the user who performed the delete
      const actorUser = await User.findById(req.session.userId);
      if (actorUser && (!ownerUser || String(actorUser._id) !== String(ownerUser._id))) {
        actorUser.notifications = actorUser.notifications || [];
        actorUser.notifications.push({
          message: `You deleted request ${request.orderId || request.id}`,
          type: 'request-delete-self',
          data: {
            requestId: request._id,
          },
        });
        await actorUser.save();
      }

      await Request.findByIdAndDelete(req.params.id);
    }
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// List all requests with dynamic search
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const searchQuery = req.query.q;
    let requests;

    if (searchQuery) {
      // If there's a search query, perform a case-insensitive search on the 'name' field
      requests = await Request.find({
        name: { $regex: new RegExp(searchQuery, 'i') },
      }).populate('owner', '_id name profileImage'); // Populate the owner field with user data
    } else {
      // If there's no search query, list all requests
      requests = await Request.find().populate('owner', '_id name profileImage'); // Populate the owner field with user data
    }

    // Respond with JSON data containing the search results
    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Reports view with basic filters
router.get('/reports', isAuthenticated, async (req, res) => {
  try {
    const { from, to, owner, product, city } = req.query;
    const filter = {};

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = new Date(from);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    if (owner) {
      filter.owner = owner;
    }

    if (product) {
      filter.product = new RegExp(product, 'i');
    }

    if (city) {
      filter.city = new RegExp(city, 'i');
    }

    const users = await User.find({}, '_id name');
    const requests = await Request.find(filter).populate('owner', '_id name');

    const total = requests.length;
    const completed = requests.filter((r) => r.status === 'Resolved' || r.status === 'Closed').length;
    const conversionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const summary = { total, completed, conversionRate };

    res.render('reports', {
      users,
      requests,
      summary,
      filters: { from: from || '', to: to || '', owner: owner || '', product: product || '', city: city || '' },
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// CSV import (admin-only via /dashboard) for bulk lead creation
router.get('/import', isAuthenticated, async (req, res) => {
  res.render('import', { summary: null });
});

router.post('/import', isAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('import', { summary: { imported: 0, skipped: 0, error: 'No file uploaded.' } });
    }

    const filePath = req.file.path;
    const raw = fs.readFileSync(filePath, 'utf8');
    fs.unlinkSync(filePath);

    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return res.render('import', { summary: { imported: 0, skipped: 0, error: 'File appears to be empty.' } });
    }

    const header = lines[0].split(',').map((h) => h.trim());
    const idx = (name) => header.indexOf(name);

    const idxCustomerName = idx('customerName');
    const idxCustomerEmail = idx('customerEmail');
    const idxCustomerPhone = idx('customerPhone');
    const idxProduct = idx('product');
    const idxCity = idx('city');
    const idxOwnerEmail = idx('ownerEmail');
    const idxStatus = idx('status');
    const idxDeadline = idx('deadline');
    const idxNextFollowUpDate = idx('nextFollowUpDate');

    let imported = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length === 0 || cols.every((c) => !c.trim())) {
        continue;
      }

      const ownerEmail = idxOwnerEmail >= 0 ? cols[idxOwnerEmail].trim() : '';
      if (!ownerEmail) {
        skipped++;
        continue;
      }

      const ownerUser = await User.findOne({ email: ownerEmail });
      if (!ownerUser) {
        skipped++;
        continue;
      }

      const status = idxStatus >= 0 ? cols[idxStatus].trim() : 'Open';
      const customerName = idxCustomerName >= 0 ? cols[idxCustomerName].trim() : '';
      const customerEmail = idxCustomerEmail >= 0 ? cols[idxCustomerEmail].trim() : '';
      const customerPhone = idxCustomerPhone >= 0 ? cols[idxCustomerPhone].trim() : '';
      const product = idxProduct >= 0 ? cols[idxProduct].trim() : '';
      const city = idxCity >= 0 ? cols[idxCity].trim() : '';

      const deadlineRaw = idxDeadline >= 0 ? cols[idxDeadline].trim() : '';
      const nextFollowRaw = idxNextFollowUpDate >= 0 ? cols[idxNextFollowUpDate].trim() : '';

      const deadline = deadlineRaw ? new Date(deadlineRaw) : undefined;
      const nextFollowUpDate = nextFollowRaw ? new Date(nextFollowRaw) : undefined;

      const orderId = await generateOrderId();

      const request = new Request({
        orderId,
        type: 'Lead',
        name: customerName || `${product} - ${city}`,
        tag: 'Import',
        owner: ownerUser._id,
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
      imported++;
    }

    res.render('import', { summary: { imported, skipped, error: null } });
  } catch (error) {
    console.error(error);
    res.render('import', { summary: { imported: 0, skipped: 0, error: 'Failed to import leads.' } });
  }
});


module.exports = router;
