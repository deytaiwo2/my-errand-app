const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet'); // Add helmet for security headers
const cookieParser = require('cookie-parser'); // Add cookie-parser for JWT cookies
require('dotenv').config();

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler.middleware');
const { apiLimiter } = require('./middleware/rateLimiter.middleware');

// Database connection
const db = require('./config/db.mysql');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
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

// Import Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/errands', require('./routes/errands.routes'));
// Import other routes here

// Test database connection
db.testConnection()
  .then((connected) => {
    if (connected) {
      console.log('Database connection successful');
    } else {
      console.error('Warning: Database connection test failed');
    }
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });

// Serve static files from the React app build directory in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Catch-all handler to serve React's index.html for any request not handled by API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api/*', notFound);

// Global error handler - must be last
app.use(errorHandler);

module.exports = app;
