require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/students', require('./routes/students'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/makeups', require('./routes/makeups'));

const PORT = process.env.PORT || 5000;

module.exports = app; // экспорт для Vercel