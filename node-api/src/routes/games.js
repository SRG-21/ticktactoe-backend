import express from 'express';
import GameService from '../services/GameService.js';
import AuthService from '../services/AuthService.js';

const router = express.Router();

/**
 * Middleware to validate player token
 */
async function validatePlayer(req, res, next) {
  const { playerId, token } = req.body;

  if (!playerId || !token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'playerId and token are required',
    });
  }

  const isValid = await AuthService.validateToken(playerId, token);
  if (!isValid) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid player credentials',
    });
  }

  next();
}

/**
 * POST /api/create
 * Create a new game
 */
router.post('/create', validatePlayer, async (req, res) => {
  try {
    const { playerId } = req.body;
    const result = await GameService.createGame(playerId);

    res.status(201).json(result);
  } catch (error) {
    console.error('[GAME ROUTE] Create game failed:', error);
    res.status(500).json({
      error: 'Failed to create game',
      message: error.message,
    });
  }
});

/**
 * POST /api/join
 * Join an existing game
 */
router.post('/join', validatePlayer, async (req, res) => {
  try {
    const { gameId, playerId } = req.body;

    if (!gameId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'gameId is required',
      });
    }

    const result = await GameService.joinGame(gameId, playerId);

    res.json(result);
  } catch (error) {
    console.error('[GAME ROUTE] Join game failed:', error);
    
    // Handle specific errors
    if (error.message === 'GAME_NOT_FOUND') {
      return res.status(404).json({
        error: 'Game not found',
        message: 'The specified game does not exist',
      });
    }
    
    if (error.message === 'GAME_FULL') {
      return res.status(400).json({
        error: 'Game full',
        message: 'This game already has 2 players',
      });
    }
    
    if (error.message === 'GAME_FINISHED') {
      return res.status(400).json({
        error: 'Game finished',
        message: 'This game has already ended',
      });
    }

    res.status(500).json({
      error: 'Failed to join game',
      message: error.message,
    });
  }
});

/**
 * GET /api/games/:gameId
 * Get game state (from Redis or MongoDB)
 */
router.get('/games/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;

    // Try to get from Redis first (active game)
    let game = await GameService.getGameState(gameId);

    // If not in Redis, try MongoDB (finished game)
    if (!game) {
      const PersistenceService = (await import('../services/PersistenceService.js')).default;
      game = await PersistenceService.getFinishedGame(gameId);
    }

    if (!game) {
      return res.status(404).json({
        error: 'Game not found',
        message: 'The specified game does not exist',
      });
    }

    res.json(game);
  } catch (error) {
    console.error('[GAME ROUTE] Get game failed:', error);
    res.status(500).json({
      error: 'Failed to get game',
      message: error.message,
    });
  }
});

/**
 * GET /api/games
 * List active games (for debugging/admin)
 */
router.get('/games', async (req, res) => {
  try {
    const gameIds = await GameService.listActiveGames();
    res.json({
      count: gameIds.length,
      games: gameIds,
    });
  } catch (error) {
    console.error('[GAME ROUTE] List games failed:', error);
    res.status(500).json({
      error: 'Failed to list games',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/games/:gameId
 * Delete a game (admin/cleanup)
 */
router.delete('/games/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const success = await GameService.deleteGame(gameId);

    if (success) {
      res.json({ message: 'Game deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete game' });
    }
  } catch (error) {
    console.error('[GAME ROUTE] Delete game failed:', error);
    res.status(500).json({
      error: 'Failed to delete game',
      message: error.message,
    });
  }
});

export default router;
