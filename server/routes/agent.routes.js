const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db.mysql').pool;
const router = express.Router();


router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.execute('SELECT * FROM delivery_agents WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid login' });
  }
  const token = jwt.sign({ id: user.id, role: 'agent' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  // Return token and user object with userType
  res.json({ 
    token,
    user: {
      id: user.id,
      name: user.full_name || user.name,
      email: user.email,
      userType: 'runner'
    }
  });
});


router.post('/register', async (req, res) => {
  const {
    full_name, email, phone, password, national_id,
    precise_location, admissible_weight_kg, available_hours_per_day,
    transportation_mode, police_report_link, accepts_tracking
  } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);
    await db.execute(`
      INSERT INTO delivery_agents (
        full_name, email, phone, password, national_id,
        precise_location, admissible_weight_kg, available_hours_per_day,
        transportation_mode, police_report_link, accepts_tracking
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      full_name, email, phone, hashed, national_id,
      precise_location, admissible_weight_kg, available_hours_per_day,
      transportation_mode, police_report_link, accepts_tracking
    ]);
    res.status(201).json({ message: 'Delivery agent registered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Agent registration failed' });
  }
});

module.exports = router;
