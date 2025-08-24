const http = require('http');
const app = require('./app');
const { Server } = require('socket.io');
const connectMySQL = require('./config/db.mysql');
const connectMongoDB = require('./config/db.mongo');

const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
  console.error('UNCUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

console.log('[STARTUP] Creating HTTP server...');
const server = http.createServer(app);
console.log('[STARTUP] HTTP server created. Initializing Socket.IO...');
const io = new Server(server, { cors: { origin: "*" } });

console.log('[STARTUP] Connecting to MySQL...');
connectMySQL(); // Will gracefully handle connection errors
console.log('[STARTUP] Connecting to MongoDB...');
connectMongoDB();

try {
  console.log('[STARTUP] Loading socket handlers...');
  const newLocal = './sockets/socketHandler';
  require(newLocal)(io);
  console.log('[STARTUP] Socket handlers loaded.');
} catch (e) {
  console.error('[STARTUP] Failed to load socket handlers:', e);
}

console.log(`[STARTUP] Starting server on port ${PORT}...`);
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
