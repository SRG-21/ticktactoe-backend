import redisClient from '../config/redis.js';

const GAME_TTL = 60 * 60; // 1 hour in seconds

class GameService {
  /**
   * Generate a random 6-character game code
   */
  generateGameCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar characters
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new game
   */
  async createGame(playerId) {
    // Generate unique game code
    let gameId = this.generateGameCode();
    let attempts = 0;
    
    while (attempts < 10) {
      const exists = await redisClient.exists(`game:${gameId}`);
      if (exists === 0) break;
      gameId = this.generateGameCode();
      attempts++;
    }
    
    if (attempts >= 10) {
      throw new Error('Failed to generate unique game code');
    }

    // Initialize game state
    const gameState = {
      gameId,
      board: JSON.stringify(Array(9).fill('')),
      players: JSON.stringify({ [playerId]: 'X' }),
      playerSymbols: JSON.stringify({ [playerId]: 'X' }),
      turn: playerId,
      status: 'waiting', // waiting for second player
      result: 'null',
      winner: 'null',
      winningLine: 'null',
      createdAt: Date.now().toString(),
      lastMoveTime: Date.now().toString(),
    };

    try {
      // Store game in Redis
      await redisClient.hSet(`game:${gameId}`, gameState);
      await redisClient.expire(`game:${gameId}`, GAME_TTL);
      
      console.log(`[GAME] Created new game: ${gameId} by player ${playerId}`);
      
      return { gameId, playerId };
    } catch (error) {
      console.error('[GAME] Create game error:', error);
      throw new Error('Failed to create game');
    }
  }

  /**
   * Join an existing game
   */
  async joinGame(gameId, playerId) {
    try {
      // Check if game exists
      const exists = await redisClient.exists(`game:${gameId}`);
      if (exists === 0) {
        throw new Error('GAME_NOT_FOUND');
      }

      // Get current game state
      const gameState = await redisClient.hGetAll(`game:${gameId}`);
      
      // Check if game is already full or finished
      if (gameState.status === 'finished') {
        throw new Error('GAME_FINISHED');
      }

      const players = JSON.parse(gameState.players || '{}');
      const playerSymbols = JSON.parse(gameState.playerSymbols || '{}');

      // Check if player is already in the game
      if (players[playerId]) {
        return { 
          gameId, 
          playerId, 
          symbol: playerSymbols[playerId],
          alreadyJoined: true 
        };
      }

      // Check if game is full (2 players max)
      if (Object.keys(players).length >= 2) {
        throw new Error('GAME_FULL');
      }

      // Add player as 'O'
      players[playerId] = 'O';
      playerSymbols[playerId] = 'O';

      // Update game state
      await redisClient.hSet(`game:${gameId}`, {
        players: JSON.stringify(players),
        playerSymbols: JSON.stringify(playerSymbols),
        status: 'playing', // Game can now start
      });

      console.log(`[GAME] Player ${playerId} joined game ${gameId}`);

      return { 
        gameId, 
        playerId, 
        symbol: 'O',
        alreadyJoined: false
      };
    } catch (error) {
      console.error('[GAME] Join game error:', error);
      throw error;
    }
  }

  /**
   * Get game state
   */
  async getGameState(gameId) {
    try {
      const gameState = await redisClient.hGetAll(`game:${gameId}`);
      
      if (Object.keys(gameState).length === 0) {
        return null;
      }

      // Parse JSON fields
      return {
        ...gameState,
        board: JSON.parse(gameState.board || '[]'),
        players: JSON.parse(gameState.players || '{}'),
        playerSymbols: JSON.parse(gameState.playerSymbols || '{}'),
        winningLine: gameState.winningLine !== 'null' ? JSON.parse(gameState.winningLine) : null,
      };
    } catch (error) {
      console.error('[GAME] Get game state error:', error);
      return null;
    }
  }

  /**
   * Delete a game (cleanup)
   */
  async deleteGame(gameId) {
    try {
      await redisClient.del(`game:${gameId}`);
      await redisClient.del(`game:${gameId}:moves`);
      console.log(`[GAME] Deleted game: ${gameId}`);
      return true;
    } catch (error) {
      console.error('[GAME] Delete game error:', error);
      return false;
    }
  }

  /**
   * List active games (for debugging)
   */
  async listActiveGames() {
    try {
      const keys = await redisClient.keys('game:*');
      const gameIds = keys
        .filter(key => !key.includes(':moves') && !key.includes(':events'))
        .map(key => key.replace('game:', ''));
      
      return gameIds;
    } catch (error) {
      console.error('[GAME] List games error:', error);
      return [];
    }
  }
}

export default new GameService();
