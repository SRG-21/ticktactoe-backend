import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import redisClient from '../config/redis.js';

const TOKEN_TTL = 60 * 60; // 1 hour in seconds (data persisted to MongoDB)

class AuthService {
  /**
   * Register a new player and generate credentials
   */
  async registerPlayer() {
    const playerId = `p-${uuidv4()}`;
    const token = crypto.randomBytes(32).toString('hex');
    
    try {
      // Store player in Redis hash
      await redisClient.hSet(`player:${playerId}`, {
        playerId,
        createdAt: Date.now().toString(),
      });
      
      // Store token with playerId reference
      await redisClient.set(`token:${token}`, playerId, {
        EX: TOKEN_TTL
      });
      
      // Store token in player hash for validation
      await redisClient.hSet(`player:${playerId}`, 'token', token);
      await redisClient.expire(`player:${playerId}`, TOKEN_TTL);
      
      console.log(`[AUTH] Registered new player: ${playerId}`);
      
      return { playerId, token };
    } catch (error) {
      console.error('[AUTH] Registration error:', error);
      throw new Error('Failed to register player');
    }
  }

  /**
   * Validate a player's token
   */
  async validateToken(playerId, token) {
    try {
      // Check if token exists and matches playerId
      const storedPlayerId = await redisClient.get(`token:${token}`);
      
      if (!storedPlayerId || storedPlayerId !== playerId) {
        return false;
      }
      
      // Verify player exists
      const exists = await redisClient.exists(`player:${playerId}`);
      return exists === 1;
    } catch (error) {
      console.error('[AUTH] Token validation error:', error);
      return false;
    }
  }

  /**
   * Refresh token TTL
   */
  async refreshToken(playerId, token) {
    try {
      await redisClient.expire(`token:${token}`, TOKEN_TTL);
      await redisClient.expire(`player:${playerId}`, TOKEN_TTL);
      return true;
    } catch (error) {
      console.error('[AUTH] Token refresh error:', error);
      return false;
    }
  }

  /**
   * Get player info
   */
  async getPlayer(playerId) {
    try {
      const player = await redisClient.hGetAll(`player:${playerId}`);
      return Object.keys(player).length > 0 ? player : null;
    } catch (error) {
      console.error('[AUTH] Get player error:', error);
      return null;
    }
  }
}

export default new AuthService();
