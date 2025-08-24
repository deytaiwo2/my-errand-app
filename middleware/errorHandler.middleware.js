/**
 * Not found middleware - handles 404 errors
 */
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Error handler middleware - processes all errors
 */
const errorHandler = (err, req, res, next) => {
  // Set status code (default to 500 if not already set)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  
  // Prepare response based on environment
  const response = {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
  };
  
  // Log error for server side debugging
  console.error(`[ERROR] ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }
  
  // Send response
  res.json(response);
};

module.exports = { notFound, errorHandler };
