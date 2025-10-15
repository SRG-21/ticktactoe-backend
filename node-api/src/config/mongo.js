import { MongoClient } from 'mongodb';

const mongoURL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB_NAME || 'tictactoe';

const client = new MongoClient(mongoURL, {
  maxPoolSize: 10,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 5000,
});

let db = null;

async function connect() {
  try {
    await client.connect();
    console.log('[MONGO] Connected to MongoDB');
    
    db = client.db(dbName);
    
    // Create indexes
    await db.collection('games').createIndex({ gameId: 1 }, { unique: true });
    await db.collection('games').createIndex({ finishedAt: -1 });
    await db.collection('players').createIndex({ playerId: 1 }, { unique: true });
    
    console.log('[MONGO] Database indexes created');
  } catch (error) {
    console.error('[MONGO] Connection error:', error);
    throw error;
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call connect() first.');
  }
  return db;
}

async function close() {
  if (client) {
    await client.close();
    console.log('[MONGO] Connection closed');
  }
}

// Connect on module load
await connect();

export { getDb, close };
export default { getDb, close };
