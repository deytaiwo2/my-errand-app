/**
 * Request validation middleware
 * Contains validation functions for different routes
 */

/**
 * Email validation regex pattern
 * Validates most common email formats
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;

/**
 * Password validation regex pattern
 * Requires at least 8 characters, including one uppercase letter,
 * one lowercase letter, one number, and one special character
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

/**
 * Generic validation middleware
 * 
 * @param {Object} schema - Validation schema with field names and validation functions
 * @returns {Function} Express middleware function
 */
const validate = (schema) => {
  return (req, res, next) => {
    const errors = {};
    
    // Validate each field according to its schema
    Object.keys(schema).forEach(field => {
      const value = req.body[field];
      const { required, validator, message } = schema[field];
      
      // Check if field is required but missing
      if (required && (value === undefined || value === null || value === '')) {
        errors[field] = `${field} is required`;
      } 
      // If value exists and has a validator, run the validation
      else if (value !== undefined && value !== null && validator && !validator(value)) {
        errors[field] = message || `Invalid ${field}`;
      }
    });
    
    // If there are validation errors, return them
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    // No errors, proceed to the next middleware
    next();
  };
};

/**
 * Validation schema for user registration
 */
const validateRegistration = validate({
  name: {
    required: true,
    validator: (value) => value.length >= 2 && value.length <= 50,
    message: 'Name must be between 2 and 50 characters'
  },
  email: {
    required: true,
    validator: (value) => EMAIL_REGEX.test(value),
    message: 'Please provide a valid email address'
  },
  password: {
    required: true,
    validator: (value) => PASSWORD_REGEX.test(value),
    message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character'
  },
  role: {
    required: false,
    validator: (value) => ['client', 'agent', 'admin'].includes(value),
    message: 'Role must be client, agent, or admin'
  }
});

/**
 * Validation schema for user login
 */
const validateLogin = validate({
  email: {
    required: true,
    validator: (value) => EMAIL_REGEX.test(value),
    message: 'Please provide a valid email address'
  },
  password: {
    required: true,
    validator: (value) => value.length >= 6,
    message: 'Password is required'
  }
});

/**
 * Validation schema for creating an errand
 */
const validateErrand = validate({
  pickup: {
    required: true,
    validator: (value) => value.length >= 5,
    message: 'Pickup location must be at least 5 characters'
  },
  dropoff: {
    required: true,
    validator: (value) => value.length >= 5,
    message: 'Dropoff location must be at least 5 characters'
  },
  weight_kg: {
    required: true,
    validator: (value) => !isNaN(value) && parseFloat(value) > 0,
    message: 'Weight must be a positive number'
  },
  estimated_hours: {
    required: true,
    validator: (value) => !isNaN(value) && parseFloat(value) > 0,
    message: 'Estimated hours must be a positive number'
  }
});

/**
 * Validation schema for payment processing
 */
const validatePayment = validate({
  amount: {
    required: true,
    validator: (value) => !isNaN(value) && parseFloat(value) > 0,
    message: 'Payment amount must be a positive number'
  },
  currency: {
    required: false,
    validator: (value) => /^[A-Z]{3}$/.test(value),
    message: 'Currency must be a 3-letter code (e.g., USD)'
  },
  errand_id: {
    required: true,
    validator: (value) => !isNaN(value) && parseInt(value) > 0,
    message: 'Valid errand ID is required'
  }
});

// Export validation middlewares
module.exports = {
  validateRegistration,
  validateLogin,
  validateErrand,
  validatePayment,
  validate // Export the generic validator for custom schemas
};

