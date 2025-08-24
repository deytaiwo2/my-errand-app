const express = require('express');
const { body, param, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { pool } = require('../config/db.mysql');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/errands');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images, videos, and documents
    if (file.fieldname === 'images') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for images field'));
      }
    } else if (file.fieldname === 'videos') {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed for videos field'));
      }
    } else if (file.fieldname === 'documents') {
      if (file.mimetype === 'application/pdf' || 
          file.mimetype === 'application/msword' ||
          file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.mimetype === 'text/plain') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF, DOC, DOCX, and TXT files are allowed for documents field'));
      }
    } else {
      cb(new Error('Unexpected field'));
    }
  }
});

// Utility functions for handling wallets
const { 
  getUserWallet, 
  updateWalletBalance, 
  createWalletTransaction, 
  processErrandPayment, 
  releaseEscrowFunds,
  getAllWalletBalances 
} = require('../utils/wallet-utils');

const { v4: uuidv4 } = require('uuid');

const jsonResponse = (res, status, success, data = null, error = null) => {
    res.status(status).json({
        success,
        data,
        error,
        correlationId: uuidv4(),
        timestamp: new Date().toISOString()
    });
};

// Get all errands
router.get('/', async (req, res) => {
  try {
    const { status, user_type } = req.query;
    const userId = req.user.id;
    
    let query = `
      SELECT e.*, u.name as client_name, r.name as runner_name 
      FROM errands e 
      LEFT JOIN users u ON e.client_id = u.id 
      LEFT JOIN users r ON e.runner_id = r.id
    `;
    let params = [];
    
    if (user_type === 'client') {
      query += ' WHERE e.client_id = ?';
      params.push(userId);
    } else if (user_type === 'runner') {
      query += ' WHERE e.runner_id = ? OR e.runner_id IS NULL';
      params.push(userId);
    }
    
    if (status) {
      query += params.length > 0 ? ' AND e.status = ?' : ' WHERE e.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY e.created_at DESC';
    
    const [errands] = await pool.execute(query, params);
    jsonResponse(res, 200, true, errands);
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Create new errand
router.post('/create', async (req, res) => {
  try {
    const { title, description, pickup_address, delivery_address, amount, estimated_hours, weight_kg, urgency, category } = req.body;
    const clientId = req.user.id;
    
    const [result] = await pool.execute(
      `INSERT INTO errands (client_id, title, description, pickup_address, delivery_address, amount, estimated_hours, weight_kg, urgency, category) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, title, description, pickup_address, delivery_address, amount, estimated_hours || 1, weight_kg || 0, urgency || 'medium', category]
    );
    
    jsonResponse(res, 201, true, { errandId: result.insertId, message: 'Errand created successfully' });
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Get unassigned errands for runners
router.get('/unassigned', async (req, res) => {
  try {
    const [errands] = await pool.execute(
      `SELECT e.*, u.name as client_name 
       FROM errands e 
       LEFT JOIN users u ON e.client_id = u.id 
       WHERE e.runner_id IS NULL AND e.status = 'pending' 
       ORDER BY e.created_at DESC`
    );
    
    jsonResponse(res, 200, true, errands);
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Assign errand to runner
router.patch('/assign/:errand_id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const errandId = req.params.errand_id;
    const runnerId = req.user.id;
    
    // Check if errand exists and is available
    const [errand] = await connection.execute(
      'SELECT * FROM errands WHERE id = ? AND runner_id IS NULL AND status = "pending"',
      [errandId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or already assigned');
    }
    
    // Assign errand to runner
    await connection.execute(
      'UPDATE errands SET runner_id = ?, status = "assigned" WHERE id = ?',
      [runnerId, errandId]
    );
    
    await connection.commit();
    jsonResponse(res, 200, true, { message: 'Errand assigned successfully' });
  } catch (error) {
    await connection.rollback();
    jsonResponse(res, 500, false, null, error.message);
  } finally {
    connection.release();
  }
});

// Pay for errand (move funds to escrow)
router.post('/pay/:errand_id', async (req, res) => {
  try {
    const errandId = req.params.errand_id;
    const clientId = req.user.id;
    
    // Get errand details
    const [errand] = await pool.execute(
      'SELECT * FROM errands WHERE id = ? AND client_id = ? AND payment_status = "pending"',
      [errandId, clientId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or already paid');
    }
    
    // Process payment to escrow
    const result = await processErrandPayment(clientId, errandId, errand[0].amount);
    jsonResponse(res, 200, true, result);
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Start errand
router.patch('/start/:errand_id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const errandId = req.params.errand_id;
    const runnerId = req.user.id;
    
    // Check if errand is assigned to this runner
    const [errand] = await connection.execute(
      'SELECT * FROM errands WHERE id = ? AND runner_id = ? AND status = "assigned"',
      [errandId, runnerId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or not assigned to you');
    }
    
    await connection.execute(
      'UPDATE errands SET status = "in_progress", started_at = NOW() WHERE id = ?',
      [errandId]
    );
    
    await connection.commit();
    jsonResponse(res, 200, true, { message: 'Errand started successfully' });
  } catch (error) {
    await connection.rollback();
    jsonResponse(res, 500, false, null, error.message);
  } finally {
    connection.release();
  }
});

// Complete errand
router.patch('/complete/:errand_id', async (req, res) => {
  try {
    const errandId = req.params.errand_id;
    const runnerId = req.user.id;
    
    // Get errand details
    const [errand] = await pool.execute(
      'SELECT * FROM errands WHERE id = ? AND runner_id = ? AND status = "in_progress"',
      [errandId, runnerId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or not in progress');
    }
    
    // Release escrow funds to runner
    const result = await releaseEscrowFunds(
      errand[0].client_id, 
      runnerId, 
      errandId, 
      errand[0].amount
    );
    
    // Update errand status
    await pool.execute(
      'UPDATE errands SET status = "completed", completed_at = NOW() WHERE id = ?',
      [errandId]
    );
    
    jsonResponse(res, 200, true, result);
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Get client's errands
router.get('/client', async (req, res) => {
  try {
    const clientId = req.user.id;
    
    const [errands] = await pool.execute(
      `SELECT e.*, r.name as runner_name 
       FROM errands e 
       LEFT JOIN users r ON e.runner_id = r.id 
       WHERE e.client_id = ? 
       ORDER BY e.created_at DESC`,
      [clientId]
    );
    
    jsonResponse(res, 200, true, { errands });
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Get available errands for runners
router.get('/available', async (req, res) => {
  try {
    const [errands] = await pool.execute(
      `SELECT e.*, u.name as client_name 
       FROM errands e 
       LEFT JOIN users u ON e.client_id = u.id 
       WHERE e.runner_id IS NULL AND e.status = 'pending' AND e.payment_status = 'escrowed'
       ORDER BY e.created_at DESC`
    );
    
    jsonResponse(res, 200, true, { errands });
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Get runner's errands
router.get('/runner', async (req, res) => {
  try {
    const runnerId = req.user.id;
    
    const [errands] = await pool.execute(
      `SELECT e.*, u.name as client_name, u.phone as client_phone 
       FROM errands e 
       LEFT JOIN users u ON e.client_id = u.id 
       WHERE e.runner_id = ? 
       ORDER BY e.created_at DESC`,
      [runnerId]
    );
    
    jsonResponse(res, 200, true, { errands });
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

// Cancel errand
router.patch('/cancel/:errand_id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const errandId = req.params.errand_id;
    const userId = req.user.id;
    
    // Get errand details
    const [errand] = await connection.execute(
      'SELECT * FROM errands WHERE id = ? AND (client_id = ? OR runner_id = ?)',
      [errandId, userId, userId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or you are not authorized');
    }
    
    const errandData = errand[0];
    
    // Check if errand can be cancelled
    if (errandData.status === 'completed') {
      return jsonResponse(res, 400, false, null, 'Cannot cancel completed errand');
    }
    
    // If payment was made, refund to client's spendable wallet
    if (errandData.payment_status === 'escrowed') {
      // Get client's wallets
      const [escrowWallet] = await connection.execute(
        'SELECT * FROM wallets WHERE user_id = ? AND wallet_type = "escrow" AND currency = "USD"',
        [errandData.client_id]
      );
      
      const [spendableWallet] = await connection.execute(
        'SELECT * FROM wallets WHERE user_id = ? AND wallet_type = "spendable" AND currency = "USD"',
        [errandData.client_id]
      );
      
      if (escrowWallet.length > 0 && spendableWallet.length > 0) {
        // Transfer from escrow back to spendable
        await connection.execute(
          'UPDATE wallets SET balance = balance - ? WHERE id = ?',
          [errandData.amount, escrowWallet[0].id]
        );
        
        await connection.execute(
          'UPDATE wallets SET balance = balance + ? WHERE id = ?',
          [errandData.amount, spendableWallet[0].id]
        );
        
        // Record refund transaction
        await connection.execute(
          `INSERT INTO wallet_transactions (
            from_wallet_id, to_wallet_id, transaction_type, amount, currency,
            description, errand_id, status, processed_at
          ) VALUES (?, ?, 'refund', ?, 'USD', ?, ?, 'completed', NOW())`,
          [escrowWallet[0].id, spendableWallet[0].id, errandData.amount, 
           `Refund for cancelled errand #${errandId}`, errandId]
        );
      }
    }
    
    // Update errand status
    await connection.execute(
      'UPDATE errands SET status = "cancelled", cancelled_at = NOW() WHERE id = ?',
      [errandId]
    );
    
    await connection.commit();
    jsonResponse(res, 200, true, { message: 'Errand cancelled successfully' });
  } catch (error) {
    await connection.rollback();
    jsonResponse(res, 500, false, null, error.message);
  } finally {
    connection.release();
  }
});

// Accept errand
router.post('/:errand_id/accept', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const errandId = req.params.errand_id;
    const runnerId = req.user.id;
    
    // Check if errand exists and is available
    const [errand] = await connection.execute(
      'SELECT * FROM errands WHERE id = ? AND runner_id IS NULL AND status = "pending" AND payment_status = "escrowed"',
      [errandId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or not available');
    }
    
    // Assign errand to runner
    await connection.execute(
      'UPDATE errands SET runner_id = ?, status = "assigned", accepted_at = NOW() WHERE id = ?',
      [runnerId, errandId]
    );
    
    await connection.commit();
    jsonResponse(res, 200, true, { message: 'Errand accepted successfully' });
  } catch (error) {
    await connection.rollback();
    jsonResponse(res, 500, false, null, error.message);
  } finally {
    connection.release();
  }
});

// Update errand status
router.put('/:errand_id/status', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const errandId = req.params.errand_id;
    const { status } = req.body;
    const userId = req.user.id;
    
    // Validate status
    const validStatuses = ['assigned', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return jsonResponse(res, 400, false, null, 'Invalid status');
    }
    
    // Check if user is the runner of this errand
    const [errand] = await connection.execute(
      'SELECT * FROM errands WHERE id = ? AND runner_id = ?',
      [errandId, userId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or not assigned to you');
    }
    
    const errandData = errand[0];
    
    // Update status
    let updateQuery = 'UPDATE errands SET status = ? WHERE id = ?';
    let params = [status, errandId];
    
    if (status === 'in_progress') {
      updateQuery = 'UPDATE errands SET status = ?, started_at = NOW() WHERE id = ?';
    } else if (status === 'completed') {
      updateQuery = 'UPDATE errands SET status = ?, completed_at = NOW(), payment_status = "released" WHERE id = ?';
      
      // Release escrow funds to runner using centralized utility function
      if (errandData.payment_status === 'escrowed') {
        // Temporarily commit transaction to allow utility function to work
        await connection.commit();
        
        try {
          await releaseEscrowFunds(
            errandData.client_id,
            userId,
            errandId,
            errandData.amount
          );
          console.log(`✅ FUNDS RELEASED: $${errandData.amount} transferred to runner ${userId} for errand ${errandId}`);
        } catch (escrowError) {
          console.error('❌ ERROR releasing escrow funds:', escrowError);
          // Continue with status update even if escrow release fails
        }
        
        // Start new transaction for status update
        await connection.beginTransaction();
      }
    }
    
    await connection.execute(updateQuery, params);
    await connection.commit();
    
    jsonResponse(res, 200, true, { 
      message: `Errand status updated to ${status}`,
      fundsReleased: status === 'completed' && errandData.payment_status === 'escrowed'
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ ERROR in status update:', error);
    jsonResponse(res, 500, false, null, error.message);
  } finally {
    connection.release();
  }
});

// Update errand progress with file uploads
router.post('/update-progress', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 3 },
  { name: 'documents', maxCount: 5 }
]), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const { errandId, status, notes } = req.body;
    const userId = req.user.id;
    
    // Verify the errand belongs to this runner
    const [errand] = await connection.execute(
      'SELECT * FROM errands WHERE id = ? AND runner_id = ?',
      [errandId, userId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or not assigned to you');
    }
    
    // Update errand status if provided
    if (status && status !== errand[0].status) {
      const errandData = errand[0];
      let updateQuery = 'UPDATE errands SET status = ? WHERE id = ?';
      let params = [status, errandId];
      
      if (status === 'in_progress') {
        updateQuery = 'UPDATE errands SET status = ?, started_at = NOW() WHERE id = ?';
      } else if (status === 'completed') {
        updateQuery = 'UPDATE errands SET status = ?, completed_at = NOW(), payment_status = "released" WHERE id = ?';
        
        // Release escrow funds to runner using centralized utility function
        if (errandData.payment_status === 'escrowed') {
          // Temporarily commit transaction to allow utility function to work
          await connection.commit();
          
          try {
            await releaseEscrowFunds(
              errandData.client_id,
              userId,
              errandId,
              errandData.amount
            );
            console.log(`✅ FUNDS RELEASED (Progress): $${errandData.amount} transferred to runner ${userId} for errand ${errandId}`);
          } catch (escrowError) {
            console.error('❌ ERROR releasing escrow funds:', escrowError);
            // Continue with status update even if escrow release fails
          }
          
          // Start new transaction for remaining operations
          await connection.beginTransaction();
        }
      }
      
      await connection.execute(updateQuery, params);
    }
    
    // Create progress update record
    const [progressResult] = await connection.execute(
      'INSERT INTO errand_progress (errand_id, runner_id, notes, created_at) VALUES (?, ?, ?, NOW())',
      [errandId, userId, notes || '']
    );
    
    const progressId = progressResult.insertId;
    
    // Handle file uploads
    if (req.files) {
      const fileTypes = ['images', 'videos', 'documents'];
      
      for (const type of fileTypes) {
        if (req.files[type]) {
          for (const file of req.files[type]) {
            await connection.execute(
              'INSERT INTO errand_files (progress_id, errand_id, file_type, file_name, file_path, file_size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
              [progressId, errandId, type.slice(0, -1), file.originalname, file.path, file.size, file.mimetype]
            );
          }
        }
      }
    }
    
    await connection.commit();
    jsonResponse(res, 200, true, { message: 'Progress updated successfully', progressId });
  } catch (error) {
    await connection.rollback();
    
    // Clean up uploaded files if database operation failed
    if (req.files) {
      const allFiles = Object.values(req.files).flat();
      allFiles.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    jsonResponse(res, 500, false, null, error.message);
  } finally {
    connection.release();
  }
});

// Get errand progress history
router.get('/:errand_id/progress', async (req, res) => {
  try {
    const errandId = req.params.errand_id;
    const userId = req.user.id;
    
    // Check if user has access to this errand
    const [errand] = await pool.execute(
      'SELECT * FROM errands WHERE id = ? AND (client_id = ? OR runner_id = ?)',
      [errandId, userId, userId]
    );
    
    if (errand.length === 0) {
      return jsonResponse(res, 404, false, null, 'Errand not found or access denied');
    }
    
    // Get progress history with files
    const [progress] = await pool.execute(
      `SELECT p.*, u.name as runner_name,
              GROUP_CONCAT(
                CASE WHEN f.file_type = 'image' THEN f.file_name END
              ) as images,
              GROUP_CONCAT(
                CASE WHEN f.file_type = 'video' THEN f.file_name END
              ) as videos,
              GROUP_CONCAT(
                CASE WHEN f.file_type = 'document' THEN f.file_name END
              ) as documents
       FROM errand_progress p
       LEFT JOIN users u ON p.runner_id = u.id
       LEFT JOIN errand_files f ON p.id = f.progress_id
       WHERE p.errand_id = ?
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [errandId]
    );
    
    jsonResponse(res, 200, true, { progress });
  } catch (error) {
    jsonResponse(res, 500, false, null, error.message);
  }
});

module.exports = router;

