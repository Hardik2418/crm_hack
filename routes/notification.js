const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware');
const User = require('../models/user');

// Route to view notifications
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    // Fetch all notifications for the user
    const notifications = user.notifications;

    // Decide where the brand/home link should take the user based on role
    let homePath = '/dashboard';
    if (user.role === 'employee') {
      homePath = '/employee/dashboard';
    } else if (user.role === 'client') {
      homePath = '/client/dashboard';
    }

    res.render('notifications', { notifications, homePath, user });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Route to delete a notification
router.post('/:id/delete', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const notificationIdToDelete = req.params.id;

    // Remove the notification from the user's notifications array
    user.notifications = user.notifications.filter((notification) => notification._id.toString() !== notificationIdToDelete);
    await user.save();

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//Route to mark the notification as read
router.post('/:id/read', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const notificationIdToRead = req.params.id;

    // Find the notification in the user's notifications array
    const notification = user.notifications.find(notification => notification._id.toString() === notificationIdToRead);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Mark the notification as read if it's not already read
    if (!notification.read) {
      notification.read = true;
      await user.save();
    }

    res.redirect('/notifications');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;