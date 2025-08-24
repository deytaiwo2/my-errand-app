const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db.mysql').pool;

router.post('/register', async (req, res) => {
  try {
    const { 
      email, password, name, phone, userType,
      // Client-specific fields
      address, city, zipCode, preferredContactMethod, typicalErrands, maxBudgetPerErrand,
      specialInstructions, emergencyContacts, smsNotifications, termsAccepted, privacyAccepted,
      // Runner-specific fields
      vehicleType, areasOfService, availableHours, preferredErrandTypes, insuranceCoverage,
      emergencyContactName, emergencyContactPhone
    } = req.body;
    
    // Check if user already exists
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }
    
    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    
    // Get connection and start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();
    
    try {
      // Insert into users table
      const [userResult] = await connection.execute(
        'INSERT INTO users (name, email, password, phone, user_type, balance) VALUES (?, ?, ?, ?, ?, ?)', 
        [name, email, hashed, phone || null, userType, 0.00]
      );
      
      const userId = userResult.insertId;
      
      // Insert into specific user type table
      if (userType === 'client') {
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
      } else if (userType === 'runner') {
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
      
      // Commit transaction
      await connection.commit();
      
      res.json({ 
        message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} registered successfully`,
        userId: userId,
        userType: userType
      });
      
    } catch (transactionError) {
      // Rollback transaction on error
      await connection.rollback();
      throw transactionError;
    } finally {
      // Release connection back to pool
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
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    const user = users[0];
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      process.env.JWT_SECRET || 'fallback-secret', 
      { expiresIn: '7d' }
    );
    
    // Return user data (without password)
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      userType: user.user_type || null,
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
    // Check if demo user exists, if not create it
    const [existing] = await db.execute('SELECT * FROM users WHERE email = ?', ['demo@example.com']);
    
    let user;
    if (existing.length === 0) {
      // Create demo user
      const hashedPassword = await bcrypt.hash('demo123', 10);
      const [result] = await db.execute(
        'INSERT INTO users (name, email, password, balance) VALUES (?, ?, ?, ?)', 
        ['Demo User', 'demo@example.com', hashedPassword, 125.50]
      );
      user = {
        id: result.insertId,
        name: 'Demo User',
        email: 'demo@example.com',
        balance: 125.50
      };
    } else {
      user = {
        id: existing[0].id,
        name: existing[0].name,
        email: existing[0].email,
        balance: parseFloat(existing[0].balance || 125.50)
      };
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      process.env.JWT_SECRET || 'fallback-secret', 
      { expiresIn: '7d' }
    );
    
    // Ensure user has a userType for frontend routing (default to 'client')
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
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    
    // Check if email is already taken by another user
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ? AND id != ?', 
      [email, userId]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'Email is already taken by another user' });
    }
    
    // Get connection and start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();
    
    try {
      // Update users table
      await connection.execute(
        'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
        [name, email, phone || null, userId]
      );
      
      // Get user type to determine which table to update
      const [userRows] = await connection.execute(
        'SELECT user_type FROM users WHERE id = ?',
        [userId]
      );
      
      const userType = userRows[0]?.user_type;
      
      // Update user-type specific table if address is provided
      if (address && userType === 'client') {
        await connection.execute(
          'UPDATE clients SET address = ? WHERE user_id = ?',
          [address, userId]
        );
      }
      
      // Commit transaction
      await connection.commit();
      
      // Get updated user data
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
      
      // Add address if user is a client
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
