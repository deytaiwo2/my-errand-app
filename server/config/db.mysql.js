const mysql = require('mysql2');
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: '',
  database: process.env.MYSQL_DATABASE || 'errandsplace'
});
module.exports = () => pool.getConnection(err => {
  if (err) throw err;
  console.log('✅ MySQL Connected');
});
module.exports.pool = pool.promise();
