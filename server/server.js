const http = require('http');
const app = require('./app');
const { Server } = require('socket.io');
const connectMySQL = require('./config/db.mysql');
const connectMongoDB = require('./config/db.mongo');

const PORT = process.env.PORT || 5000;

process.on('uncaughtException', console.trace);


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

connectMySQL();
connectMongoDB();
const newLocal = './sockets/socketHandler';
require(newLocal)(io);

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
