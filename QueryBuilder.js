/**
 * Enhanced QueryBuilder.js
 * Adds advanced validation, sanitization, support for aliases, compound queries,
 * query optimization, and prepared statement handling.
 */

const { validateIdentifier, sanitizeCondition } = require('./db.service');

class QueryBuilder {
  constructor() {
    this.reset();
  }

  reset() {
    this.queryParts = {
      with: '',
      select: '',
      from: '',
      joins: [],
      where: '',
      groupBy: '',
      having: '',
      orderBy: '',
      limit: '',
      union: [],
      distinct: false,
      queryParams: []
    };
  }

  withCTE(name, cteBuilder) {
    validateIdentifier(name, 'CTE name');
    if (!this.queryParts.with) {
      this.queryParts.with = `WITH ${name} AS (${cteBuilder.build().query})`;
    } else {
      this.queryParts.with += `, ${name} AS (${cteBuilder.build().query})`;
    }
    this.queryParts.queryParams.push(...cteBuilder.build().params);
    return this;
  }

  distinct(enable = true) {
    this.queryParts.distinct = enable;
    return this;
  }

  select(columns = ['*']) {
    if (!Array.isArray(columns)) {
      columns = [columns];
    }
    columns.forEach(col => {
      if (col !== '*') {
        // Allow alias syntax: column AS alias or column alias
        const aliasSplit = col.toUpperCase().split(/\s+AS\s+|\s+/);
        validateIdentifier(aliasSplit[0], 'column');
        if (aliasSplit.length > 1) validateIdentifier(aliasSplit[1], 'alias');
      }
    });
    this.queryParts.select = `SELECT${this.queryParts.distinct ? ' DISTINCT' : ''} ${columns.join(', ')}`;
    return this;
  }

  from(table, alias) {
    validateIdentifier(table, 'table');
    if (alias) validateIdentifier(alias, 'alias');
    this.queryParts.from = `FROM ${table}${alias ? ` AS ${alias}` : ''}`;
    return this;
  }

  join(type, table, alias, condition, params = []) {
    validateIdentifier(table, 'table');
    if (alias) validateIdentifier(alias, 'alias');
    if (!['INNER', 'LEFT', 'RIGHT', 'FULL'].includes(type.toUpperCase())) {
      throw new Error(`Invalid join type: ${type}`);
    }
    const sanitizedCondition = sanitizeCondition(condition);
    this.queryParts.joins.push(
      `${type.toUpperCase()} JOIN ${table}${alias ? ` AS ${alias}` : ''} ON ${sanitizedCondition}`
    );
    this.queryParts.queryParams.push(...params);
    return this;
  }

  where(condition, params = []) {
    if (!condition) throw new Error('WHERE condition cannot be empty');
    this.queryParts.where = `WHERE ${sanitizeCondition(condition)}`;
    this._addParams(params);
    return this;
  }

  andWhere(condition, params = []) {
    if (!condition) throw new Error('AND condition cannot be empty');
    if (!this.queryParts.where) {
      return this.where(condition, params);
    }
    this.queryParts.where += ` AND ${sanitizeCondition(condition)}`;
    this._addParams(params);
    return this;
  }

  orWhere(condition, params = []) {
    if (!condition) throw new Error('OR condition cannot be empty');
    if (!this.queryParts.where) {
      return this.where(condition, params);
    }
    this.queryParts.where += ` OR ${sanitizeCondition(condition)}`;
    this._addParams(params);
    return this;
  }

  groupBy(columns) {
    if (!columns || (Array.isArray(columns) && columns.length === 0)) {
      throw new Error('GROUP BY columns cannot be empty');
    }
    if (!Array.isArray(columns)) {
      columns = [columns];
    }
    columns.forEach(col => validateIdentifier(col, 'column'));
    this.queryParts.groupBy = `GROUP BY ${columns.join(', ')}`;
    return this;
  }

  having(condition, params = []) {
    if (!condition) throw new Error('HAVING condition cannot be empty');
    this.queryParts.having = `HAVING ${sanitizeCondition(condition)}`;
    this._addParams(params);
    return this;
  }

  orderBy(column, direction = 'ASC') {
    validateIdentifier(column, 'column');
    const dir = direction.toUpperCase();
    if (dir !== 'ASC' && dir !== 'DESC') {
      throw new Error(`Invalid sort direction: ${direction}`);
    }
    this.queryParts.orderBy = `ORDER BY ${column} ${dir}`;
    return this;
  }

  limit(limit, offset = 0) {
    if (!Number.isInteger(limit) || limit < 0) throw new Error('LIMIT must be a non-negative integer');
    if (!Number.isInteger(offset) || offset < 0) throw new Error('OFFSET must be a non-negative integer');
    this.queryParts.limit = `LIMIT ? OFFSET ?`;
    this.queryParts.queryParams.push(limit, offset);
    return this;
  }

  union(otherQueryBuilder, all = false) {
    if (!(otherQueryBuilder instanceof QueryBuilder)) {
      throw new Error('union() expects an instance of QueryBuilder');
    }
    this.queryParts.union.push({ query: otherQueryBuilder.build().query, params: otherQueryBuilder.build().params, all });
    return this;
  }

  build() {
    if (!this.queryParts.select) throw new Error('SELECT clause is required');
    if (!this.queryParts.from) throw new Error('FROM clause is required');

    let sqlParts = [];
    let params = [...this.queryParts.queryParams];

    if (this.queryParts.with) {
      sqlParts.push(this.queryParts.with);
    }
    sqlParts.push(this.queryParts.select);
    sqlParts.push(this.queryParts.from);
    if (this.queryParts.joins.length > 0) {
      sqlParts.push(this.queryParts.joins.join(' '));
    }
    if (this.queryParts.where) {
      sqlParts.push(this.queryParts.where);
    }
    if (this.queryParts.groupBy) {
      sqlParts.push(this.queryParts.groupBy);
    }
    if (this.queryParts.having) {
      sqlParts.push(this.queryParts.having);
    }
    if (this.queryParts.orderBy) {
      sqlParts.push(this.queryParts.orderBy);
    }
    if (this.queryParts.limit) {
      sqlParts.push(this.queryParts.limit);
    }

    let mainQuery = sqlParts.join(' ');

    if (this.queryParts.union.length > 0) {
      this.queryParts.union.forEach(({ query, params: unionParams, all }) => {
        mainQuery += ` UNION${all ? ' ALL' : ''} ${query}`;
        params = params.concat(unionParams);
      });
    }

    this.reset(); // Reset builder state

    return { query: mainQuery, params };
  }

  _addParams(params) {
    if (!Array.isArray(params)) {
      throw new Error('Parameters must be an array');
    }
    params.forEach(param => {
      const type = typeof param;
      if (
        param === null ||
        param === undefined ||
        type === 'string' ||
        type === 'number' ||
        type === 'boolean' ||
        param instanceof Date
      ) {
        // Safe types
      } else {
        throw new Error(\`Unsupported parameter type: \${type}\`);
      }
    });
    if (this.queryParts.queryParams.length + params.length > 1000) { // Max parameter limit example
      throw new Error('Too many query parameters');
    }
    this.queryParts.queryParams.push(...params);
  }

  addQueryHint(hint) {
    if (!hint || typeof hint !== 'string') {
      throw new Error('Query hint must be a non-empty string');
    }
    if (!this.queryParts.hints) this.queryParts.hints = [];
    this.queryParts.hints.push(hint);
    return this;
  }

  addWindowFunction(expression, alias) {
    if (!expression || typeof expression !== 'string') {
      throw new Error('Window function expression must be a non-empty string');
    }
    if (alias) {
      validateIdentifier(alias, 'alias');
      if (!this.queryParts.windowFunctions) this.queryParts.windowFunctions = [];
      this.queryParts.windowFunctions.push(\`\${expression} AS \${alias}\`);
    } else {
      if (!this.queryParts.windowFunctions) this.queryParts.windowFunctions = [];
      this.queryParts.windowFunctions.push(expression);
    }
    return this;
  }

  addJsonOperation(column, path, alias) {
    validateIdentifier(column, 'column');
    if (!Array.isArray(path) || path.length === 0) {
      throw new Error('JSON path must be a non-empty array');
    }
    if (alias) validateIdentifier(alias, 'alias');
    const jsonExtract = \`JSON_EXTRACT(\${column}, '$.\${path.join('.')})'\`;
    if (!this.queryParts.jsonOperations) this.queryParts.jsonOperations = [];
    this.queryParts.jsonOperations.push(\`\${jsonExtract} AS \${alias || 'json_data'}\`);
    return this;
  }

  select(columns = ['*']) {
    if (!Array.isArray(columns)) {
      columns = [columns];
    }
    columns.forEach(col => {
      if (col !== '*') {
        const aliasSplit = col.toUpperCase().split(/\s+AS\s+|\s+/);
        validateIdentifier(aliasSplit[0], 'column');
        if (aliasSplit.length > 1) validateIdentifier(aliasSplit[1], 'alias');
      }
    });
    // Add window functions and JSON operations if any
    let selectCols = [...columns];
    if (this.queryParts.windowFunctions) {
      selectCols = selectCols.concat(this.queryParts.windowFunctions);
    }
    if (this.queryParts.jsonOperations) {
      selectCols = selectCols.concat(this.queryParts.jsonOperations);
    }
    this.queryParts.select = \`SELECT\${this.queryParts.distinct ? ' DISTINCT' : ''} \${selectCols.join(', ')}\`;
    return this;
  }

  build() {
    if (!this.queryParts.select) throw new Error('SELECT clause is required');
    if (!this.queryParts.from) throw new Error('FROM clause is required');

    let sqlParts = [];
    let params = [...this.queryParts.queryParams];

    if (this.queryParts.with) {
      sqlParts.push(this.queryParts.with);
    }
    if (this.queryParts.hints && this.queryParts.hints.length > 0) {
      sqlParts.push(this.queryParts.hints.join(' '));
    }
    sqlParts.push(this.queryParts.select);
    sqlParts.push(this.queryParts.from);
    if (this.queryParts.joins.length > 0) {
      sqlParts.push(this.queryParts.joins.join(' '));
    }
    if (this.queryParts.where) {
      sqlParts.push(this.queryParts.where);
    }
    if (this.queryParts.groupBy) {
      sqlParts.push(this.queryParts.groupBy);
    }
    if (this.queryParts.having) {
      sqlParts.push(this.queryParts.having);
    }
    if (this.queryParts.orderBy) {
      sqlParts.push(this.queryParts.orderBy);
    }
    if (this.queryParts.limit) {
      sqlParts.push(this.queryParts.limit);
    }

    let mainQuery = sqlParts.join(' ');

    if (this.queryParts.union.length > 0) {
      this.queryParts.union.forEach(({ query, params: unionParams, all }) => {
        mainQuery += \` UNION\${all ? ' ALL' : ''} \${query}\`;
        params = params.concat(unionParams);
      });
    }

    this.reset();

    return { query: mainQuery, params };
  }
}

module.exports = QueryBuilder;
