/**
 * Cloudflare Worker Entry Point
 * This file wraps your Express app to run on Cloudflare Workers
 */

import app from './server.js';

export default {
  async fetch(request, env, ctx) {
    // Add environment variables to process.env
    process.env.DATABASE_URL = env.DATABASE_URL;
    process.env.JWT_SECRET = env.JWT_SECRET;
    process.env.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
    process.env.PAYPAL_SECRET = env.PAYPAL_SECRET;
    process.env.ENVIRONMENT = env.ENVIRONMENT || 'production';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Pass request to Express app
    return app(request);
  },

  // Health check endpoint
  async health() {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
