const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db.mysql').pool;
const router = express.Router();



router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.execute('SELECT * FROM clients WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid login' });
  }
  const token = jwt.sign({ id: user.id, role: 'client' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});


router.post('/register', async (req, res) => {
  const {
    full_name, email, phone, password,
    home_address, work_address, location_description,
    preferred_weight_kg, preferred_hours, rental_interest,
    family_size, privacy_policy_accepted,
    terms_accepted, chatbot_tracking_accepted, police_report_link
  } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);
    await db.execute(`
      INSERT INTO clients (
        full_name, email, phone, password,
        home_address, work_address, location_description,
        preferred_weight_kg, preferred_hours, rental_interest,
        family_size, privacy_policy_accepted,
        terms_accepted, chatbot_tracking_accepted, police_report_link
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      full_name, email, phone, hashed,
      home_address, work_address, location_description,
      preferred_weight_kg, preferred_hours, rental_interest,
      family_size, privacy_policy_accepted,
      terms_accepted, chatbot_tracking_accepted, police_report_link
    ]);
    res.status(201).json({ message: 'Client registered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

module.exports = router;
