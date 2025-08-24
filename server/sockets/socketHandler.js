module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Client connected', socket.id);

    socket.on('updateLocation', (data) => {
      // Emit to all clients or just admin
      io.emit('driverLocationUpdate', data);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected', socket.id);
    });
  });
};
