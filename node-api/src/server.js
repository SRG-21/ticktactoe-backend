import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import gamesRoutes from './routes/games.js';
import persistenceRoutes from './routes/persistence.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// API routes
app.use('/api', authRoutes);
app.use('/api', gamesRoutes);
app.use('/api', persistenceRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[SERVER] Tic-Tac-Toe API running on port ${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully...');
  
  // Close database connections
  const { close: closeMongo } = await import('./config/mongo.js');
  const redisClient = (await import('./config/redis.js')).default;
  
  await closeMongo();
  await redisClient.quit();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SERVER] SIGINT received, shutting down gracefully...');
  
  const { close: closeMongo } = await import('./config/mongo.js');
  const redisClient = (await import('./config/redis.js')).default;
  
  await closeMongo();
  await redisClient.quit();
  
  process.exit(0);
});

export default app;
