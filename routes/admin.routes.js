const express = require('express');
const db = require('../config/db.mysql').pool;
const router = express.Router();

router.get('/payments', async (req, res) => {
    const [rows] = await db.execute(`
      SELECT p.*, e.pickup, e.dropoff, c.name AS client
      FROM payments p
      JOIN errands e ON e.id = p.errand_id
      JOIN clients c ON e.client_id = c.id
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
});

module.exports = router;
