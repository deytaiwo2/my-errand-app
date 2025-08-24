app.use('/api/clients', require('./routes/client.routes'));
app.use('/api/agents', require('./routes/agent.routes'));
app.use('/api/payments', require('./routes/payment.routes'));