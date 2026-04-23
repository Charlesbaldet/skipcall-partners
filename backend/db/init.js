require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log(' Database schema created successfully');
  } catch (err) {
    console.error(' Error creating schema:', err.message);
  } finally {
    await pool.end();
  }
}

initDB();
