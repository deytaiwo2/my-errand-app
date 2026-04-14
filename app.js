const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet'); // Add helmet for security headers
const cookieParser = require('cookie-parser'); // Add cookie-parser for JWT cookies
require('dotenv').config();


// Import middleware
const { notFound, errorHandler } = require('./middleware/errorHandler.middleware');
const rateLimit = require('express-rate-limit');

// Define the limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});



// Import middleware
// Rate limiter is already defined above
// Database connection
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = new Set([
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost',
  'http://127.0.0.1'
]);
app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests (no origin) and allowed origins
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed from origin: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Logging middleware
app.use(morgan('dev'));

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// Simple health checks
app.get('/health', (req, res) => res.json({ ok: true, service: 'my-errand-app', time: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'api', time: new Date().toISOString() }));

// Import authentication middleware
const { verifyToken } = require('./routes/auth.routes');

// Import Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/errands', require('./routes/errands.routes'));
app.use('/api/wallet', verifyToken, require('./routes/wallet.routes'));
app.use('/api/payments', verifyToken, require('./routes/payment.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
// Mount client and agent routes for frontend AuthService endpoints
app.use('/api/clients', require('./routes/client.routes'));
app.use('/api/agents', require('./routes/agent.routes'));
// Import other routes here

// Serve static files from the React app dist directory in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
  
  // Catch-all handler to serve React's index.html for any request not handled by API routes
  app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
  });
}

// 404 handler for all routes
app.use(notFound);

// Global error handler - must be last
app.use(errorHandler);

module.exports = app;
