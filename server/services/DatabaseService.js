const mysql = require('mysql2/promise');
const EventEmitter = require('events');

class DatabaseService extends EventEmitter {
    constructor() {
        super();
        this.poolConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
            queueLimit: 0,
            acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 10000
        };
        this.pool = mysql.createPool(this.poolConfig);
        this.retryAttempts = parseInt(process.env.DB_RETRY_ATTEMPTS) || 5;
        this.retryDelay = parseInt(process.env.DB_RETRY_DELAY_MS) || 5000;
        this.init();
    }

    init() {
        this.testConnection().catch(() => {
            this.retryConnection(1);
        });
    }

    async testConnection() {
        const connection = await this.pool.getConnection();
        await connection.ping();
        connection.release();
        console.log('Database connection successful');
    }

    retryConnection(attempt) {
        if (attempt > this.retryAttempts) {
            console.error(`Database connection failed after ${attempt - 1} attempts.`);
            this.emit('error', new Error('Database connection failed'));
            return;
        }
        setTimeout(async () => {
            try {
                await this.testConnection();
            } catch (err) {
                console.error(`Database connection attempt ${attempt} failed. Retrying...`);
                this.retryConnection(attempt + 1);
            }
        }, this.retryDelay);
    }

    async getConnection() {
        try {
            const connection = await this.pool.getConnection();
            // Set query timeout (if supported)
            if (connection.queryTimeout === undefined) {
                connection.queryTimeout = parseInt(process.env.DB_QUERY_TIMEOUT_MS) || 10000;
            }
            return connection;
        } catch (error) {
            console.error('Database connection error:', error);
            throw error;
        }
    }

    async executeQuery(query, params = []) {
        try {
            const [rows] = await this.pool.execute(query, params);
            return rows;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }
}

module.exports = new DatabaseService();
