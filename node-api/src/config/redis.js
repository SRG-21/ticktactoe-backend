import { createClient } from 'redis';

const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';

const client = createClient({
  url: redisURL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('[REDIS] Too many reconnection attempts, giving up');
        return new Error('Too many retries');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

client.on('error', (err) => {
  console.error('[REDIS] Client error:', err);
});

client.on('connect', () => {
  console.log('[REDIS] Connected to Redis');
});

client.on('ready', () => {
  console.log('[REDIS] Redis client ready');
});

client.on('reconnecting', () => {
  console.log('[REDIS] Reconnecting to Redis...');
});

// Connect to Redis
await client.connect();

export default client;
