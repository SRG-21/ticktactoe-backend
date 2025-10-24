import express from 'express';
import PersistenceService from '../services/PersistenceService.js';
import GameService from '../services/GameService.js';

const router = express.Router();

/**
 * POST /api/persist-finished
 * Persist a finished game to MongoDB
 * Called by Go WebSocket server when a game ends
 */
router.post('/persist-finished', async (req, res) => {
  try {
    const gameData = req.body;

    if (!gameData.gameId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'gameId is required',
      });
    }

    // Get full game state from Redis if not provided
    let fullGameData = gameData;
    if (!gameData.players || !gameData.board) {
      const redisData = await GameService.getGameState(gameData.gameId);
      if (redisData) {
        fullGameData = { ...redisData, ...gameData };
      }
    }

    // Persist to MongoDB
    await PersistenceService.persistFinishedGame(fullGameData);

    // Optionally cleanup Redis after persistence
    // await GameService.deleteGame(gameData.gameId);

    res.json({
      success: true,
      message: 'Game persisted successfully',
    });
  } catch (error) {
    console.error('[PERSISTENCE ROUTE] Persist game failed:', error);
    res.status(500).json({
      error: 'Failed to persist game',
      message: error.message,
    });
  }
});

/**
 * GET /api/games/:gameId/history
 * Get a finished game from MongoDB
 */
router.get('/games/:gameId/history', async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await PersistenceService.getFinishedGame(gameId);

    if (!game) {
      return res.status(404).json({
        error: 'Game not found',
        message: 'No finished game found with this ID',
      });
    }

    res.json(game);
  } catch (error) {
    console.error('[PERSISTENCE ROUTE] Get game history failed:', error);
    res.status(500).json({
      error: 'Failed to get game history',
      message: error.message,
    });
  }
});

/**
 * GET /api/recent-games
 * Get recent finished games
 */
router.get('/recent-games', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const games = await PersistenceService.getRecentGames(limit);

    res.json({
      count: games.length,
      games,
    });
  } catch (error) {
    console.error('[PERSISTENCE ROUTE] Get recent games failed:', error);
    res.status(500).json({
      error: 'Failed to get recent games',
      message: error.message,
    });
  }
});

/**
 * GET /api/player/:playerId/stats
 * Get player statistics
 */
router.get('/player/:playerId/stats', async (req, res) => {
  try {
    const { playerId } = req.params;
    const stats = await PersistenceService.getPlayerStats(playerId);

    res.json(stats);
  } catch (error) {
    console.error('[PERSISTENCE ROUTE] Get player stats failed:', error);
    res.status(500).json({
      error: 'Failed to get player stats',
      message: error.message,
    });
  }
});

export default router;
