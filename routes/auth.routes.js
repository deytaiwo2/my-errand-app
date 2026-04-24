const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const db = require('../config/db.mysql').pool;
const User = require('../models/User');

const useMongo = process.env.USE_MONGO === 'true' || Boolean(process.env.MONGO_URI);
const jwtSecret = process.env.JWT_SECRET || 'fallback-secret';

const formatUser = (user) => ({
  id: user._id?.toString ? user._id.toString() : user.id,
  name: user.name,
  email: user.email,
  userType: user.userType || user.user_type || 'client',
  balance: parseFloat(user.balance || 0),
  phone: user.phone || null,
  address: user.address || null,
});

router.post('/register', async (req, res) => {
  try {
    const {
      email, password, name, phone, userType,
      address, city, zipCode, preferredContactMethod, typicalErrands, maxBudgetPerErrand,
      specialInstructions, emergencyContacts, smsNotifications, termsAccepted, privacyAccepted,
      vehicleType, areasOfService, availableHours, preferredErrandTypes, insuranceCoverage,
      emergencyContactName, emergencyContactPhone
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const normalizedUserType = userType || 'client';
    const hashed = await bcrypt.hash(password, 10);

    if (useMongo) {
      const existing = await User.findOne({ email: email.toLowerCase().trim() }).lean();
      if (existing) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      const user = new User({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashed,
        phone: phone || null,
        userType: normalizedUserType,
        balance: 0,
        address: address || null,
      });

      await user.save();

      res.json({
        message: `${normalizedUserType.charAt(0).toUpperCase() + normalizedUserType.slice(1)} registered successfully`,
        userId: user._id.toString(),
        userType: user.userType
      });
      return;
    }

    // MySQL fallback registration
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      const [userResult] = await connection.execute(
        'INSERT INTO users (name, email, password, phone, user_type, balance) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, hashed, phone || null, normalizedUserType, 0.00]
      );

      const userId = userResult.insertId;

      if (normalizedUserType === 'client') {
        await connection.execute(
          `INSERT INTO clients (
            user_id, address, city, zip_code, preferred_contact_method, typical_errands, 
            max_budget_per_errand, special_instructions, emergency_contacts, 
            sms_notifications, terms_accepted, privacy_accepted, terms_accepted_at, privacy_accepted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId, address || null, city || null, zipCode || null,
            preferredContactMethod || 'phone', typicalErrands || null,
            maxBudgetPerErrand || null, specialInstructions || null,
            emergencyContacts || null, smsNotifications || true,
            termsAccepted || false, privacyAccepted || false,
            termsAccepted ? new Date() : null, privacyAccepted ? new Date() : null
          ]
        );
      } else if (normalizedUserType === 'runner') {
        await connection.execute(
          `INSERT INTO runners (
            user_id, vehicle_type, areas_of_service, available_hours, preferred_errand_types,
            insurance_coverage, emergency_contact_name, emergency_contact_phone, 
            sms_notifications, terms_accepted, privacy_accepted, terms_accepted_at, privacy_accepted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId, vehicleType || 'none', areasOfService || null, availableHours || null,
            preferredErrandTypes || null, insuranceCoverage || false,
            emergencyContactName || null, emergencyContactPhone || null,
            smsNotifications || true, termsAccepted || false, privacyAccepted || false,
            termsAccepted ? new Date() : null, privacyAccepted ? new Date() : null
          ]
        );
      }

      await connection.commit();

      res.json({
        message: `${normalizedUserType.charAt(0).toUpperCase() + normalizedUserType.slice(1)} registered successfully`,
        userId: userId,
        userType: normalizedUserType
      });
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (useMongo) {
      const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, name: user.name, userType: user.userType || 'client' },
        jwtSecret,
        { expiresIn: process.env.JWT_EXPIRY || '7d' }
      );

      return res.json({
        token,
        user: formatUser(user)
      });
    }

    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, userType: user.user_type || 'client' },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.user_type || 'client',
      balance: parseFloat(user.balance || 0)
    };

    res.json({
      token,
      user: userData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Demo user route for testing
router.post('/demo-login', async (req, res) => {
  try {
    if (useMongo) {
      let user = await User.findOne({ email: 'demo@example.com' }).lean();
      if (!user) {
        const hashedPassword = await bcrypt.hash('demo123', 10);
        const created = await User.create({
          name: 'Demo User',
          email: 'demo@example.com',
          password: hashedPassword,
          userType: 'client',
          balance: 125.50
        });
        user = created.toObject();
      }

      const token = jwt.sign(
        { id: user._id.toString(), email: user.email, name: user.name, userType: user.userType || 'client' },
        jwtSecret,
        { expiresIn: process.env.JWT_EXPIRY || '7d' }
      );

      return res.json({
        token,
        user: formatUser(user)
      });
    }

    // Check if demo user exists, if not create it
    const [existing] = await db.execute('SELECT * FROM users WHERE email = ?', ['demo@example.com']);

    let user;
    if (existing.length === 0) {
      const hashedPassword = await bcrypt.hash('demo123', 10);
      const [result] = await db.execute(
        'INSERT INTO users (name, email, password, balance) VALUES (?, ?, ?, ?)',
        ['Demo User', 'demo@example.com', hashedPassword, 125.50]
      );
      user = {
        id: result.insertId,
        name: 'Demo User',
        email: 'demo@example.com',
        balance: 125.50,
        userType: 'client'
      };
    } else {
      user = {
        id: existing[0].id,
        name: existing[0].name,
        email: existing[0].email,
        balance: parseFloat(existing[0].balance || 125.50),
        userType: existing[0].user_type || 'client'
      };
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, userType: user.userType || 'client' },
      jwtSecret,
      { expiresIn: process.env.JWT_EXPIRY || '7d' }
    );

    res.json({
      token,
      user: { ...user, userType: user.userType || 'client' }
    });
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    const userId = req.user.id;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (useMongo) {
      const existingUser = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: userId } }).lean();
      if (existingUser) {
        return res.status(400).json({ error: 'Email is already taken by another user' });
      }

      const updatedUser = await User.findOneAndUpdate(
        { _id: userId },
        {
          name: name.trim(),
          email: email.toLowerCase().trim(),
          phone: phone || null,
          address: address || null,
        },
        { new: true, runValidators: true, context: 'query' }
      ).lean();

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({
        message: 'Profile updated successfully',
        user: formatUser(updatedUser)
      });
    }

    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?',
      [email, userId]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email is already taken by another user' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      await connection.execute(
        'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
        [name, email, phone || null, userId]
      );

      const [userRows] = await connection.execute(
        'SELECT user_type FROM users WHERE id = ?',
        [userId]
      );

      const userType = userRows[0]?.user_type;

      if (address && userType === 'client') {
        await connection.execute(
          'UPDATE clients SET address = ? WHERE user_id = ?',
          [address, userId]
        );
      }

      await connection.commit();

      const [updatedUsers] = await connection.execute(
        'SELECT id, name, email, phone, balance FROM users WHERE id = ?',
        [userId]
      );

      const updatedUser = {
        id: updatedUsers[0].id,
        name: updatedUsers[0].name,
        email: updatedUsers[0].email,
        phone: updatedUsers[0].phone,
        balance: parseFloat(updatedUsers[0].balance || 0)
      };

      if (userType === 'client') {
        const [clientRows] = await connection.execute(
          'SELECT address FROM clients WHERE user_id = ?',
          [userId]
        );
        updatedUser.address = clientRows[0]?.address;
      }

      res.json({
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (transactionError) {
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Profile update failed: ' + error.message });
  }
});

module.exports = router;
module.exports.verifyToken = verifyToken;
