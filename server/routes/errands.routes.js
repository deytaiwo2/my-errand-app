const express = require('express');
const db = require('../config/db.mysql').pool;
const { body, param, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth.middleware');
const NotificationService = require('../services/NotificationService');
const rateLimit = require('../middleware/rateLimit.middleware');
const { handleError, asyncHandler } = require('../utils/errorHandler');
const structuredResponse = require('../utils/structuredResponse');
const { sanitizeInput } = require('../utils/sanitize');
const router = express.Router();
// Middleware to check role and permissions
const checkRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};

const notificationService = new NotificationService();

router.use(rateLimit); // Apply rate limiting to all routes

// Client creates errand
router.post(
  '/create',
  authMiddleware,
  [
    body('client_id').isInt().withMessage('Invalid client ID'),
    body('pickup').notEmpty().withMessage('Pickup location required'),
    body('dropoff').notEmpty().withMessage('Dropoff location required'),
    body('weight_kg').isFloat({ gt: 0 }).withMessage('Invalid weight'),
    body('estimated_hours').isFloat({ gt: 0 }).withMessage('Invalid estimated hours'),
  ],
  asyncHandler(async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || `corr-${Date.now()}`;

    console.log(`[${correlationId}] Incoming request to create errand`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error(`[${correlationId}] Validation errors:`, errors.array());
      return res.status(400).json({ errors: errors.array(), correlationId });
    }

    const { client_id, pickup, dropoff, weight_kg, estimated_hours, note } = req.body;

    sanitizeInput(req.body);
    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      await connection.execute(
        `
        INSERT INTO errands (client_id, pickup, dropoff, note, weight_kg, estimated_hours)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        [client_id, pickup, dropoff, note, weight_kg, estimated_hours],
        {
          isolationLevel: 'SERIALIZABLE'
        }
      );

      // Get the inserted errand ID
      const [result] = await connection.execute('SELECT LAST_INSERT_ID() as id');
      const errandId = result[0].id;

      // Fetch client details for notification
      const [clientRows] = await connection.execute('SELECT email, phone FROM clients WHERE id = ?', [client_id]);
      
      if (clientRows.length > 0) {
        const client = clientRows[0];
        
        // Send notifications
        try {
          await notificationService.sendEmail(
            client.email, 
            'Errand Created Successfully', 
            `Your errand has been created successfully. Pickup: ${pickup}, Dropoff: ${dropoff}`
          );
          
          await notificationService.sendSms(
            client.phone, 
            `Your errand has been created successfully. Tracking ID: ${errandId}`
          );
        } catch (notificationError) {
          console.error(`[${correlationId}] Notification error:`, notificationError.message);
          // Continue with transaction even if notification fails
        }
      }

      await connection.commit();
      console.log(`[${correlationId}] Errand successfully created and notifications sent`);
      structuredResponse(res, 201, 'Errand created', { errandId, correlationId });
      console.error(`[${correlationId}] Transaction rollback due to error: ${err.message}`);
      if (connection) await connection.rollback();
      handleError(res, 500, 'Failed to create errand', { error: err.message, correlationId });
    } finally {
      if (connection) connection.release();
      console.log(`[${correlationId}] Request for creating errand completed`);
    }
  }
);
);

router.patch(
  '/assign/:errand_id',
  authMiddleware,
  checkRole('admin'),
  param('errand_id').isInt().withMessage('Invalid errand ID'),
  body('agent_id').isInt().withMessage('Invalid agent ID'),
  async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || `corr-${Date.now()}`;

    console.log(`[${correlationId}] Incoming request to assign errand`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), correlationId });
    }

    const { errand_id } = req.params;
    const { agent_id } = req.body;
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      await connection.execute('UPDATE errands SET agent_id = ?, status = "assigned" WHERE id = ?', [agent_id, errand_id], {
        isolationLevel: 'SERIALIZABLE'
      });

      // Fetch agent details for notification
      const [agentRows] = await connection.execute('SELECT email, phone FROM agents WHERE id = ?', [agent_id]);
      const agent = agentRows[0];

      // Fetch errand details for notification
      const [errandRows] = await connection.execute('SELECT pickup, dropoff FROM errands WHERE id = ?', [errand_id]);
      const { pickup, dropoff } = errandRows[0];

      // Send notifications
      try {
        await notificationService.sendEmail(agent.email, 'New Errand Assigned', `Pickup: ${pickup}, Dropoff: ${dropoff}`);
        await notificationService.sendSms(agent.phone, `New job assigned. Pickup: ${pickup}`);
      } catch (notificationError) {
        console.error(`[${correlationId}] Notification error:`, notificationError.message);
      }
      await connection.commit();
      console.log(`[${correlationId}] Errand successfully assigned and notifications sent`);
      structuredResponse(res, 200, 'Errand assigned', { correlationId });
    } catch (err) {
      console.error(`[${correlationId}] Transaction rollback due to error: ${err.message}`);
      if (connection) await connection.rollback();
      handleError(res, 500, 'Failed to assign errand', { error: err.message, correlationId });
    } finally {
      if (connection) connection.release();
      console.log(`[${correlationId}] Request for assigning errand completed`);
    }
  }
// GET route for retrieving errands by user (client or agent)
router.get(
  '/mine/:user_id/:role',
  authMiddleware,
  [
    param('user_id').isInt().withMessage('Invalid user ID'),
    param('role').isIn(['client', 'agent']).withMessage('Invalid role'),
  ],
  asyncHandler(async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || 'no-correlation-id';

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), correlationId });
    }

    const { user_id, role } = req.params;
    const column = role === 'client' ? 'client_id' : 'agent_id';

    try {
      const [rows] = await db.execute(`SELECT * FROM errands WHERE ${column} = ?`, [user_id]);
      structuredResponse(res, 200, 'Errands fetched successfully', { errands: rows, correlationId });
    } catch (err) {
      handleError(res, 500, 'Failed to fetch errands', { error: err.message, correlationId });
    }
  })
);

// Add status update endpoint
router.patch(
  '/status/:errand_id',
  authMiddleware,
  [
    param('errand_id').isInt().withMessage('Invalid errand ID'),
    body('status').isIn(['pending', 'assigned', 'in_progress', 'completed', 'cancelled'])
      .withMessage('Invalid status value')
  ],
  asyncHandler(async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || `corr-${Date.now()}`;
    console.log(`[${correlationId}] Incoming request to update errand status`);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error(`[${correlationId}] Validation errors:`, errors.array());
      return res.status(400).json({ errors: errors.array(), correlationId });
    }

    const { errand_id } = req.params;
    const { status } = req.body;
    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Update errand status
      await connection.execute(
        'UPDATE errands SET status = ? WHERE id = ?',
        [status, errand_id],
        { isolationLevel: 'SERIALIZABLE' }
      );

      // Get errand details for notification
      const [errandRows] = await connection.execute(
        'SELECT client_id, agent_id, pickup, dropoff FROM errands WHERE id = ?',
        [errand_id]
      );
      
      if (errandRows.length > 0) {
        const errand = errandRows[0];
        
        // Notify client about status change
        if (errand.client_id) {
          const [clientRows] = await connection.execute(
            'SELECT email, phone FROM clients WHERE id = ?',
            [errand.client_id]
          );
          
          if (clientRows.length > 0) {
            const client = clientRows[0];
            try {
              await notificationService.sendEmail(
                client.email,
                `Errand Status Updated: ${status}`,
                `Your errand status has been updated to ${status}.`
              );
              
              await notificationService.sendSms(
                client.phone,
                `Your errand status has been updated to ${status}.`
              );
            } catch (notificationError) {
              console.error(`[${correlationId}] Client notification error:`, notificationError.message);
            }
          }
        }
      }

      await connection.commit();
      console.log(`[${correlationId}] Errand status successfully updated`);
      structuredResponse(res, 200, 'Errand status updated', { errand_id, status, correlationId });
    } catch (err) {
      console.error(`[${correlationId}] Transaction rollback due to error: ${err.message}`);
      if (connection) await connection.rollback();
      handleError(res, 500, 'Failed to update errand status', { error: err.message, correlationId });
    } finally {
      if (connection) connection.release();
      console.log(`[${correlationId}] Request for updating errand status completed`);
    }
  })
);
module.exports = router;
