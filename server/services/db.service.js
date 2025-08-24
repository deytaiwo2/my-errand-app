/**
 * Database service for advanced connection management
 * Handles connection pooling, transactions, and query logging
 */

const mysql = require('mysql2');
const util = require('util');
const { pool } = require('../config/db.mysql');
const { AppError } = require('../utils/error.utils');

// Valid SQL identifiers pattern
const VALID_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_]+$/;
/**
 * Execute a query with parameters
 * 
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
/**
 * Validate a SQL identifier to prevent SQL injection
 * 
 * @param {string} identifier - Table or column name
 * @param {string} type - Type of identifier (table, column)
 * @throws {Error} If identifier is invalid
 */
const validateIdentifier = (identifier, type = 'identifier') => {
  if (!identifier || typeof identifier !== 'string') {
    throw new AppError(`Invalid ${type} name: must be a non-empty string`, 500);
  }

  if (!VALID_IDENTIFIER_PATTERN.test(identifier)) {
    throw new AppError(`Invalid ${type} name: '${identifier}' contains invalid characters`, 500);
  }

  // Check for SQL keywords and reserved words
  const sqlReservedWords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'DELETE', 'UPDATE', 'DROP', 'ALTER', 
                           'CREATE', 'TABLE', 'DATABASE', 'SCHEMA', 'AND', 'OR', 'JOIN', 'UNION', 'ORDER', 
                           'GROUP', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 
                           'END', 'EXISTS', 'IN', 'ALL', 'ANY'];
  
  if (sqlReservedWords.includes(identifier.toUpperCase())) {
    throw new AppError(`Invalid ${type} name: '${identifier}' is a reserved SQL keyword`, 500);
  }
};

/**
 * Execute a query with parameters
 * 
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
const query = async (sql, params = []) => {
  try {
    // Track query start time for performance monitoring
    const startTime = Date.now();
    
    // Execute the query
    const [results] = await pool.execute(sql, params);
    
    // Log query performance in development
    if (process.env.NODE_ENV !== 'production') {
      const duration = Date.now() - startTime;
      console.log(`[DB Query] (${duration}ms): ${sql.replace(/\s+/g, ' ').trim()}`);
      
      // Log slow queries (over 500ms)
      if (duration > 500) {
        console.warn(`[Slow Query] (${duration}ms): ${sql.replace(/\s+/g, ' ').trim()}`);
      }
    }
    
    return results;
  } catch (error) {
    // Transform database errors to application errors
    let statusCode = 500;
    let message = 'Database error occurred';
    
    // Handle specific MySQL error codes
    switch (error.code) {
      case 'ER_DUP_ENTRY':
        statusCode = 409; // Conflict
        message = 'Duplicate entry';
        break;
      case 'ER_NO_REFERENCED_ROW':
      case 'ER_NO_REFERENCED_ROW_2':
        statusCode = 400; // Bad Request
        message = 'Referenced record does not exist';
        break;
      case 'ER_PARSE_ERROR':
        statusCode = 500;
        message = 'SQL syntax error';
        break;
    }
    
    // Enhance error with query information
    const appError = new AppError(message, statusCode);
    appError.originalError = error;
    appError.query = sql;
    appError.params = params;
    appError.sqlErrorCode = error.code;
    appError.sqlMessage = error.message;
    
    throw appError;
  }
};

/**
 * Execute a transaction with multiple queries
 * 
 * @param {Function} callback - Function that receives a transaction object and executes queries
 * @returns {Promise<any>} Result of the transaction
 */
const transaction = async (callback) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Create transaction object with query method
    const tx = {
      query: async (sql, params = []) => {
        const [results] = await connection.execute(sql, params);
        return results;
      }
    };
    
    // Execute transaction callback
    const result = await callback(tx);
    
    // Commit transaction
    await connection.commit();
    
    return result;
  } catch (error) {
    // Rollback transaction on error
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    
    throw error;
  } finally {
    // Release connection back to pool
    connection.release();
  }
};

/**
 * Execute a batch of queries in a single transaction
 * 
 * @param {Array<Object>} queries - Array of query objects with sql and params properties
 * @returns {Promise<Array>} Array of query results
 */
const batch = async (queries) => {
  return transaction(async (tx) => {
    const results = [];
    
    for (const { sql, params } of queries) {
      const result = await tx.query(sql, params);
      results.push(result);
    }
    
    return results;
  });
};

/**
 * Execute a stored procedure
 * 
 * @param {string} procedure - Stored procedure name
 * @param {Array} params - Procedure parameters
 * @returns {Promise<Array>} Procedure results
 */
const procedure = async (procedure, params = []) => {
  const sql = `CALL ${procedure}(${params.map(() => '?').join(',')})`;
  return query(sql, params);
};

/**
 * Get a single row by ID
 * 
 * @param {string} table - Table name
 * @param {number|string} id - ID value
 * @param {string} idField - ID field name (default: 'id')
 * @returns {Promise<Object>} Row data or null if not found
 */
const findById = async (table, id, idField = 'id') => {
  // Validate table and column names to prevent SQL injection
  validateIdentifier(table, 'table');
  validateIdentifier(idField, 'column');
  
  const results = await query(`SELECT * FROM ${table} WHERE ${idField} = ? LIMIT 1`, [id]);
  return results.length ? results[0] : null;
};

/**
 * Insert a new row
 * 
 * @param {string} table - Table name
 * @param {Object} data - Object with column values
 * @returns {Promise<Object>} Result with insertId
 */
const insert = async (table, data) => {
  // Validate table name
  validateIdentifier(table, 'table');
  
  // Validate all column names
  Object.keys(data).forEach(column => validateIdentifier(column, 'column'));
  
  const columns = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  const values = Object.values(data);
  
  const result = await query(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`, values);
  
  return {
    insertId: result.insertId,
    affectedRows: result.affectedRows
  };
};

/**
 * Update a row by ID
 * 
 * @param {string} table - Table name
 * @param {number|string} id - ID value
 * @param {Object} data - Object with column values to update
 * @param {string} idField - ID field name (default: 'id')
 * @returns {Promise<Object>} Result with affectedRows
 */
const update = async (table, id, data, idField = 'id') => {
  // Validate table and id field
  validateIdentifier(table, 'table');
  validateIdentifier(idField, 'column');
  
  // Validate all column names
  Object.keys(data).forEach(column => validateIdentifier(column, 'column'));
  
  const columns = Object.keys(data).map(column => `${column} = ?`).join(', ');
  const values = [...Object.values(data), id];
  
  const result = await query(`UPDATE ${table} SET ${columns} WHERE ${idField} = ?`, values);
  
  if (result.affectedRows === 0) {
    throw new AppError(`Record with ${idField} = ${id} not found in ${table}`, 404);
  }
  
  return {
    affectedRows: result.affectedRows
  };
};

/**
 * Delete a row by ID
 * 
 * @param {string} table - Table name
 * @param {number|string} id - ID value
 * @param {string} idField - ID field name (default: 'id')
 * @returns {Promise<Object>} Result with affectedRows
 */
const remove = async (table, id, idField = 'id') => {
  // Validate table and id field
  validateIdentifier(table, 'table');
  validateIdentifier(idField, 'column');
  
  const result = await query(`DELETE FROM ${table} WHERE ${idField} = ?`, [id]);
  
  if (result.affectedRows === 0) {
    throw new AppError(`Record with ${idField} = ${id} not found in ${table}`, 404);
  }
  
  return {
    affectedRows: result.affectedRows
  };
};

/**
 * Find records with pagination and sorting
 * 
 * @param {string} table - Table name
 * @param {Object} options - Query options
 * @param {Object} options.where - Where conditions { column: value } or { column: { operator: value } }
 * @param {Array} options.orderBy - Order by clauses [{ column: 'name', direction: 'ASC' }]
 * @param {number} options.limit - Limit results
 * @param {number} options.offset - Offset for pagination
 * @param {Array} options.columns - Columns to select (default: *)
 * @returns {Promise<Object>} Results and pagination info
 */
const findWithPagination = async (table, options = {}) => {
  validateIdentifier(table, 'table');
  
  const {
    where = {},
    orderBy = [],
    limit = 10,
    offset = 0,
    columns = ['*']
  } = options;
  
  // Validate columns
  columns.forEach(col => {
    if (col !== '*') validateIdentifier(col, 'column');
  });
  
  // Build columns part
  const columnsStr = columns.join(', ');
  
  // Build where clause and collect parameters
  let whereClause = '';
  const whereParams = [];
  
  const whereEntries = Object.entries(where);
  if (whereEntries.length > 0) {
    const conditions = [];
    
    whereEntries.forEach(([column, condition]) => {
      validateIdentifier(column, 'column');
      
      if (typeof condition === 'object' && condition !== null) {
        // Complex condition with operator
        Object.entries(condition).forEach(([operator, value]) => {
          const validOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'];
          const op = operator.toUpperCase();
          
          if (!validOperators.includes(op)) {
            throw new AppError(`Invalid operator: ${operator}`, 400);
          }
          
          if (op === 'IN' && Array.isArray(value)) {
            const placeholders = value.map(() => '?').join(', ');
            conditions.push(`${column} IN (${placeholders})`);
            whereParams.push(...value);
          } else {
            conditions.push(`${column} ${op} ?`);
            whereParams.push(value);
          }
        });
      } else {
        // Simple equality condition
        conditions.push(`${column} = ?`);
        whereParams.push(condition);
      }
    });
    
    whereClause = `WHERE ${conditions.join(' AND ')}`;
  }
  
  // Build order by clause
  let orderByClause = '';
  if (orderBy.length > 0) {
    const orderClauses = orderBy.map(({ column, direction = 'ASC' }) => {
      validateIdentifier(column, 'column');
      
      const dir = direction.toUpperCase();
      if (dir !== 'ASC' && dir !== 'DESC') {
        throw new AppError(`Invalid sort direction: ${direction}`, 400);
      }
      
      return `${column} ${dir}`;
    });
    
    orderByClause = `ORDER BY ${orderClauses.join(', ')}`;
  }
  
  // Get total count for pagination
  const countQuery = `SELECT COUNT(*) AS total FROM ${table} ${whereClause}`;
  const countResult = await query(countQuery, whereParams);
  const total = countResult[0].total;
  
  // Get paginated data
  const dataQuery = `
    SELECT ${columnsStr} 
    FROM ${table} 
    ${whereClause} 
    ${orderByClause} 
    LIMIT ? OFFSET ?
  `;
  
  const params = [...whereParams, limit, offset];
  const data = await query(dataQuery, params);
  
  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Check the health of the database connection
 * 
 * @returns {Promise<Object>} Health status
 */
const healthCheck = async () => {
  try {
    const startTime = Date.now();
    await query('SELECT 1');
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'up',
      responseTime,
      connections: {
        active: pool.pool.activeConnections(),
        idle: pool.pool.idleConnections(),
        total: pool.pool.totalConnections()
      }
    };
  } catch (error) {
    return {
      status: 'down',
      error: error.message
    };
  }
};

/**
 * Bulk insert multiple records
 * 
 * @param {string} table - Table name
 * @param {Array<Object>} records - Array of records to insert
 * @returns {Promise<Object>} Result with insertIds and affectedRows
 */
const bulkInsert = async (table, records) => {
  if (!Array.isArray(records) || records.length === 0) {
    throw new AppError('Records must be a non-empty array', 400);
  }
  
  validateIdentifier(table, 'table');
  
  // Get columns from the first record
  const columns = Object.keys(records[0]);
  columns.forEach(column => validateIdentifier(column, 'column'));
  
  // Build placeholders for each record
  const placeholders = records.map(() => 
    `(${columns.map(() => '?').join(', ')})`
  ).join(', ');
  
  // Flatten all values
  const values = records.flatMap(record => {
    // Ensure all records have the same columns
    const recordColumns = Object.keys(record);
    if (recordColumns.length !== columns.length || 
        !columns.every(col => recordColumns.includes(col))) {
      throw new AppError('All records must have the same columns', 400);
    }
    
    return columns.map(col => record[col]);
  });
  
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
  const result = await query(sql, values);
  
  return {
    insertId: result.insertId,
    affectedRows: result.affectedRows
  };
};

module.exports = {
  query,
  transaction,
  batch,
  procedure,
  findById,
  insert,
  update,
  remove,
  findWithPagination,
  healthCheck,
  bulkInsert,
  validateIdentifier,
  pool
};
