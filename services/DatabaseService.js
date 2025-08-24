const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

class DatabaseService {
    async getConnection() {
        try {
            const connection = await pool.getConnection();
            return connection;
        } catch (error) {
            console.error('Database connection error:', error);
            throw error;
        }
    }
}

module.exports = new DatabaseService();

