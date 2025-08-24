/**
 * QueryBuilder.js
 * A utility for building safe and composable SQL queries
 */

const { validateIdentifier, sanitizeCondition } = require('./db.service');

class QueryBuilder {
    constructor() {
        this.reset();
        this.startTime = null;
    }

    join(type, tableWithAlias, condition, params = []) {
        const [table, alias] = tableWithAlias.split(' ').filter(Boolean);
        validateIdentifier(table, 'table');
        if (!['INNER', 'LEFT', 'RIGHT', 'FULL'].includes(type.toUpperCase())) {
            throw new Error(`Invalid join type: ${type}`);
        const sanitizedCondition = sanitizeCondition(condition);
        this.query += ` ${type.toUpperCase()} JOIN ${table} ON ${sanitizedCondition}`;
        this._addParams(params);
        this.complexity++;
        return this;
        return this;
    }

    limitQueryComplexity(maxComplexity) {
        const complexity = this.calculateComplexity();
        if (complexity > maxComplexity) {
            throw new Error(`Query complexity exceeds limit: ${complexity}/${maxComplexity}`);
        }
        return this;
    }

    calculateComplexity() {
        // Simplistic complexity estimate based on the number of joins and nested queries
        return (this.query.match(/JOIN/g) || []).length + (this.query.match(/\(/g) || []).length;
    }

    groupBy(columns) {
        if (Array.isArray(columns)) {
            columns.forEach(col => validateIdentifier(col, 'column'));
            this.query += ` GROUP BY ${columns.join(', ')}`;
        } else {
            validateIdentifier(columns, 'column');
            this.query += ` GROUP BY ${columns}`;
        }
        return this;
    }

    having(condition, params = []) {
        if (!condition) return this;
        const sanitizedCondition = sanitizeCondition(condition);
        this.query += ` HAVING ${sanitizedCondition}`;
        this.params.push(...params);
        return this;
    }

    nestedQuery(subQueryBuilder) {
        const { query, params } = subQueryBuilder.build();
        this.query += ` (${query})`;
        this.params.push(...params);
        return this;
    }

    reset() {
        this.query = '';
        this.params = [];
        this.complexity = 0;
    }

    select(columns = '*', distinct = false) {
        if (Array.isArray(columns)) {
            columns.forEach(col => validateIdentifier(col, 'column'));
            this.query += `SELECT${distinct ? ' DISTINCT' : ''} ${columns.join(', ')}`;
        } else {
            validateIdentifier(columns, 'column');
            this.query += `SELECT${distinct ? ' DISTINCT' : ''} ${columns}`;
        }
        return this;
    }

    from(table) {
        validateIdentifier(table, 'table');
        this.query += ` FROM ${table}`;
        return this;
    }

    where(condition, params = []) {
        if (!condition) return this;
        const sanitizedCondition = sanitizeCondition(condition);
        this.query += ` WHERE ${sanitizedCondition}`;
        this.params.push(...params);
        return this;
    }

    andWhere(condition, params = []) {
        if (!condition) return this;
        const sanitizedCondition = sanitizeCondition(condition);
        this.query += ` AND ${sanitizedCondition}`;
        this.params.push(...params);
        return this;
    }

    orWhere(condition, params = []) {
        if (!condition) return this;
        const sanitizedCondition = sanitizeCondition(condition);
        this.query += ` OR ${sanitizedCondition}`;
        this.params.push(...params);
        return this;
    }

    orderBy(column, direction = 'ASC') {
        validateIdentifier(column, 'column');
        const dir = direction.toUpperCase();
        if (dir !== 'ASC' && dir !== 'DESC') {
            throw new Error(`Invalid sort direction: ${direction}`);
        }
        this.query += ` ORDER BY ${column} ${dir}`;
        this.params.push(column);
        return this;
    }

    limit(limit, offset = 0) {
        if (!Number.isInteger(limit) || limit < 0) throw new Error('LIMIT must be a non-negative integer');
        if (!Number.isInteger(offset) || offset < 0) throw new Error('OFFSET must be a non-negative integer');
        this.query += ` LIMIT ? OFFSET ?`;
        this._addParams([limit, offset]);
        this.complexity++;
        return this;
    }

    build() {
        const builtQuery = { query: this.query.trim(), params: this.params };
        this.reset();
        return builtQuery;
    }
}

    _addParams(params) {
        if (!Array.isArray(params)) {
            throw new Error('Parameters must be an array');
        }
        params.forEach(param => {
            if (['string', 'number', 'boolean'].includes(typeof param) || param instanceof Date) {
                // Safe types
            } else {
                throw new Error(`Unsupported parameter type: ${typeof param}`);
            }
        });
        this.params.push(...params);
    }

    startTimer() {
        this.startTime = Date.now();
    }

    logExecutionTime() {
        if (this.startTime) {
            console.log(`Query executed in ${Date.now() - this.startTime} ms`);
            this.startTime = null;
        }
    }
}

module.exports = QueryBuilder;

