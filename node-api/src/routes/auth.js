import express from 'express';
import AuthService from '../services/AuthService.js';

const router = express.Router();

/**
 * POST /api/register
 * Register a new player and receive credentials
 */
router.post('/register', async (req, res) => {
  try {
    const { playerId, token } = await AuthService.registerPlayer();
    
    res.status(201).json({
      playerId,
      token,
    });
  } catch (error) {
    console.error('[AUTH ROUTE] Registration failed:', error);
    res.status(500).json({
      error: 'Failed to register player',
      message: error.message,
    });
  }
});

/**
 * POST /api/validate
 * Validate player token
 */
router.post('/validate', async (req, res) => {
  try {
    const { playerId, token } = req.body;

    if (!playerId || !token) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'playerId and token are required',
      });
    }

    const isValid = await AuthService.validateToken(playerId, token);

    if (isValid) {
      // Refresh token TTL on successful validation
      await AuthService.refreshToken(playerId, token);
    }

    res.json({
      valid: isValid,
    });
  } catch (error) {
    console.error('[AUTH ROUTE] Validation failed:', error);
    res.status(500).json({
      error: 'Failed to validate token',
      message: error.message,
    });
  }
});

/**
 * GET /api/player/:playerId
 * Get player information
 */
router.get('/player/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const player = await AuthService.getPlayer(playerId);

    if (!player) {
      return res.status(404).json({
        error: 'Player not found',
      });
    }

    // Don't send token in response
    delete player.token;

    res.json(player);
  } catch (error) {
    console.error('[AUTH ROUTE] Get player failed:', error);
    res.status(500).json({
      error: 'Failed to get player',
      message: error.message,
    });
  }
});

export default router;
