const express = require('express');
const mongoose = require('mongoose');
const productRoutes = require('./routes/productRoutes');
const logger = require('./middleware/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Body parsing + logging
app.use(express.json({ limit: '100kb' }));
app.use(logger);

// API index
app.get('/', (req, res) => {
  res.json({
    name: 'Inventory and Data Management System API',
    endpoints: {
      'GET    /api/health': 'Service + database status',
      'GET    /api/products': 'List products (filter: category, supplier, search, minPrice, maxPrice, minQty, maxQty, inStock, lowStock | sort | page, limit)',
      'POST   /api/products': 'Create a product',
      'GET    /api/products/:id': 'Get one product',
      'PUT    /api/products/:id': 'Update product details',
      'PATCH  /api/products/:id/stock': 'Adjust stock { "change": 10 } or { "type": "sale", "amount": 3 }',
      'DELETE /api/products/:id': 'Delete a product',
      'GET    /api/products/low-stock': 'Low-stock alert report (aggregation)',
      'GET    /api/products/summary': 'Category-wise inventory summary (aggregation)',
    },
  });
});

app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({ status: 'ok', database: states[mongoose.connection.readyState] || 'unknown' });
});

app.use('/api/products', productRoutes);

// 404 + centralized error handling (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
