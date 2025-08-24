const mysql = require('mysql2');
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'errandsplace',
  ssl: false,
  acquireTimeout: 10000,
  timeout: 10000
});

module.exports = () => {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('❌ MySQL Connection Error:', err.message);
      console.error('⚠️  App will continue with MongoDB only');
      return;
    }
    console.log('✅ MySQL Connected');
    if (connection) connection.release();
  });
};

module.exports.pool = pool.promise();
