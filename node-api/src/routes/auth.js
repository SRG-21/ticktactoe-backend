import express from 'express';
import AuthService from '../services/AuthService.js';
import UserService from '../services/UserService.js';

const router = express.Router();

/**
 * POST /api/signup
 * Sign up with email and password
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and password are required',
      });
    }

    const result = await UserService.signup(email, password, displayName);

    res.status(201).json(result);
  } catch (error) {
    console.error('[AUTH ROUTE] Signup failed:', error);
    
    // Determine appropriate status code
    const status = error.message.includes('already registered') ? 409 : 
                   error.message.includes('Invalid') || error.message.includes('must') ? 400 : 500;

    res.status(status).json({
      error: 'Signup failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/signin
 * Sign in with email and password
 */
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email and password are required',
      });
    }

    const result = await UserService.signin(email, password);

    res.json(result);
  } catch (error) {
    console.error('[AUTH ROUTE] Signin failed:', error);
    
    res.status(401).json({
      error: 'Signin failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/signout
 * Sign out and invalidate token
 */
router.post('/signout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    await UserService.signout(token);

    res.json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    console.error('[AUTH ROUTE] Signout failed:', error);
    res.status(500).json({
      error: 'Signout failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/me
 * Get current user info (requires auth)
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    const session = await UserService.validateSession(token);
    if (!session) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    const user = await UserService.getUserById(session.userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    res.json({
      userId: user.userId,
      playerId: user.playerId,
      email: user.email,
      displayName: user.displayName,
    });
  } catch (error) {
    console.error('[AUTH ROUTE] Get me failed:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message,
    });
  }
});

/**
 * POST /api/register
 * Register a new anonymous player (legacy - for quick play without account)
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
 * Validate player token (supports both JWT and legacy tokens)
 */
router.post('/validate', async (req, res) => {
  try {
    const { playerId, token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'token is required',
      });
    }

    // Try JWT validation first
    const session = await UserService.validateSession(token);
    if (session) {
      return res.json({
        valid: true,
        userId: session.userId,
        playerId: session.playerId,
      });
    }

    // Fall back to legacy validation
    if (playerId) {
      const isValid = await AuthService.validateToken(playerId, token);

      if (isValid) {
        await AuthService.refreshToken(playerId, token);
        return res.json({ valid: true, playerId });
      }
    }

    res.json({ valid: false });
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
