import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../config/mongo.js';
import redisClient from '../config/redis.js';

const JWT_SECRET = process.env.JWT_SECRET || 'tictactoe-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const SALT_ROUNDS = 12;
const SESSION_TTL = 60 * 60; // 1 hour in seconds

// Email regex - RFC 5322 simplified
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

// Password requirements: min 8 chars, 1 uppercase, 1 lowercase, 1 number
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

class UserService {
  /**
   * Validate email format
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, message: 'Email is required' };
    }
    
    const trimmedEmail = email.trim().toLowerCase();
    
    if (trimmedEmail.length > 254) {
      return { valid: false, message: 'Email is too long' };
    }
    
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return { valid: false, message: 'Invalid email format' };
    }
    
    return { valid: true, email: trimmedEmail };
  }

  /**
   * Validate password strength
   */
  validatePassword(password) {
    if (!password || typeof password !== 'string') {
      return { valid: false, message: 'Password is required' };
    }
    
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters' };
    }
    
    if (password.length > 128) {
      return { valid: false, message: 'Password is too long' };
    }
    
    if (!PASSWORD_REGEX.test(password)) {
      return { 
        valid: false, 
        message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number' 
      };
    }
    
    return { valid: true };
  }

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  generateToken(userId, playerId) {
    return jwt.sign(
      { userId, playerId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  /**
   * Sign up a new user
   */
  async signup(email, password, displayName) {
    // Validate email
    const emailValidation = this.validateEmail(email);
    if (!emailValidation.valid) {
      throw new Error(emailValidation.message);
    }

    // Validate password
    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    const normalizedEmail = emailValidation.email;
    const db = getDb();
    const usersCollection = db.collection('users');

    // Check if email already exists
    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await this.hashPassword(password);

    // Create user
    const userId = `u-${uuidv4()}`;
    const playerId = `p-${uuidv4()}`;
    const now = new Date();

    const user = {
      userId,
      playerId,
      email: normalizedEmail,
      passwordHash,
      displayName: displayName?.trim() || normalizedEmail.split('@')[0],
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.insertOne(user);

    // Generate token
    const token = this.generateToken(userId, playerId);

    // Store session in Redis
    await this.createSession(userId, playerId, token);

    console.log(`[USER] New user registered: ${normalizedEmail} (${userId})`);

    return {
      userId,
      playerId,
      email: normalizedEmail,
      displayName: user.displayName,
      token,
    };
  }

  /**
   * Sign in user
   */
  async signin(email, password) {
    // Validate email format
    const emailValidation = this.validateEmail(email);
    if (!emailValidation.valid) {
      throw new Error('Invalid email or password');
    }

    const normalizedEmail = emailValidation.email;
    const db = getDb();
    const usersCollection = db.collection('users');

    // Find user
    const user = await usersCollection.findOne({ email: normalizedEmail });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValid = await this.comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await usersCollection.updateOne(
      { userId: user.userId },
      { $set: { lastLoginAt: new Date() } }
    );

    // Generate token
    const token = this.generateToken(user.userId, user.playerId);

    // Store session in Redis
    await this.createSession(user.userId, user.playerId, token);

    console.log(`[USER] User signed in: ${normalizedEmail}`);

    return {
      userId: user.userId,
      playerId: user.playerId,
      email: user.email,
      displayName: user.displayName,
      token,
    };
  }

  /**
   * Sign out user
   */
  async signout(token) {
    if (!token) {
      return true;
    }

    try {
      // Decode token to get userId
      const decoded = this.verifyToken(token);
      if (decoded) {
        // Remove session from Redis
        await redisClient.del(`session:${decoded.userId}`);
        console.log(`[USER] User signed out: ${decoded.userId}`);
      }
      
      // Blacklist token
      const ttl = Math.floor((decoded?.exp || Date.now()/1000 + 3600) - Date.now()/1000);
      if (ttl > 0) {
        await redisClient.set(`blacklist:${token}`, '1', { EX: ttl });
      }
    } catch (error) {
      console.error('[USER] Signout error:', error);
    }

    return true;
  }

  /**
   * Create session in Redis
   */
  async createSession(userId, playerId, token) {
    await redisClient.hSet(`session:${userId}`, {
      userId,
      playerId,
      token,
      createdAt: Date.now().toString(),
    });
    await redisClient.expire(`session:${userId}`, SESSION_TTL);

    // Also store player reference for game compatibility
    await redisClient.hSet(`player:${playerId}`, {
      playerId,
      userId,
      createdAt: Date.now().toString(),
    });
    await redisClient.expire(`player:${playerId}`, SESSION_TTL);
  }

  /**
   * Validate session/token
   */
  async validateSession(token) {
    if (!token) {
      return null;
    }

    // Check if token is blacklisted
    const isBlacklisted = await redisClient.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      return null;
    }

    // Verify token
    const decoded = this.verifyToken(token);
    if (!decoded) {
      return null;
    }

    // Check session exists
    const session = await redisClient.hGetAll(`session:${decoded.userId}`);
    if (!session || Object.keys(session).length === 0) {
      return null;
    }

    // Refresh session TTL
    await redisClient.expire(`session:${decoded.userId}`, SESSION_TTL);
    await redisClient.expire(`player:${decoded.playerId}`, SESSION_TTL);

    return {
      userId: decoded.userId,
      playerId: decoded.playerId,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    const db = getDb();
    const user = await db.collection('users').findOne({ userId });
    
    if (!user) {
      return null;
    }

    // Don't return password hash
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Get user profile (public info)
   */
  async getProfile(userId) {
    const user = await this.getUserById(userId);
    if (!user) {
      return null;
    }

    return {
      userId: user.userId,
      playerId: user.playerId,
      displayName: user.displayName,
      createdAt: user.createdAt,
    };
  }
}

export default new UserService();
