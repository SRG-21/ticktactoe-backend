import { getDb } from '../config/mongo.js';

class PersistenceService {
  /**
   * Persist a finished game to MongoDB
   */
  async persistFinishedGame(gameData) {
    try {
      const db = getDb();
      const gamesCollection = db.collection('games');

      // Prepare document
      const document = {
        gameId: gameData.gameId,
        board: Array.isArray(gameData.board) ? gameData.board : JSON.parse(gameData.board || '[]'),
        players: typeof gameData.players === 'object' ? gameData.players : JSON.parse(gameData.players || '{}'),
        playerSymbols: typeof gameData.playerSymbols === 'object' ? gameData.playerSymbols : JSON.parse(gameData.playerSymbols || '{}'),
        status: gameData.status || 'finished',
        result: gameData.result || null,
        winner: gameData.winner !== 'null' && gameData.winner !== null ? gameData.winner : null,
        winningLine: gameData.winningLine !== 'null' && gameData.winningLine !== null
          ? (Array.isArray(gameData.winningLine) ? gameData.winningLine : JSON.parse(gameData.winningLine))
          : null,
        createdAt: parseInt(gameData.createdAt) || Date.now(),
        finishedAt: parseInt(gameData.lastMoveTime) || Date.now(),
        moves: gameData.moves || [],
      };

      // Insert or update
      await gamesCollection.updateOne(
        { gameId: document.gameId },
        { $set: document },
        { upsert: true }
      );

      console.log(`[PERSISTENCE] Persisted finished game: ${gameData.gameId}`);
      return true;
    } catch (error) {
      console.error('[PERSISTENCE] Failed to persist game:', error);
      throw error;
    }
  }

  /**
   * Get a finished game by ID
   */
  async getFinishedGame(gameId) {
    try {
      const db = getDb();
      const gamesCollection = db.collection('games');

      const game = await gamesCollection.findOne({ gameId });
      
      if (!game) {
        return null;
      }

      // Remove MongoDB _id field
      delete game._id;
      
      return game;
    } catch (error) {
      console.error('[PERSISTENCE] Failed to get game:', error);
      throw error;
    }
  }

  /**
   * Get recent finished games
   */
  async getRecentGames(limit = 10) {
    try {
      const db = getDb();
      const gamesCollection = db.collection('games');

      const games = await gamesCollection
        .find({})
        .sort({ finishedAt: -1 })
        .limit(limit)
        .toArray();

      // Remove MongoDB _id fields
      return games.map(game => {
        delete game._id;
        return game;
      });
    } catch (error) {
      console.error('[PERSISTENCE] Failed to get recent games:', error);
      throw error;
    }
  }

  /**
   * Get player statistics
   */
  async getPlayerStats(playerId) {
    try {
      const db = getDb();
      const gamesCollection = db.collection('games');

      const totalGames = await gamesCollection.countDocuments({
        [`players.${playerId}`]: { $exists: true }
      });

      const wins = await gamesCollection.countDocuments({
        winner: playerId
      });

      const draws = await gamesCollection.countDocuments({
        [`players.${playerId}`]: { $exists: true },
        result: 'draw'
      });

      const losses = totalGames - wins - draws;

      return {
        playerId,
        totalGames,
        wins,
        draws,
        losses,
        winRate: totalGames > 0 ? (wins / totalGames * 100).toFixed(2) : 0,
      };
    } catch (error) {
      console.error('[PERSISTENCE] Failed to get player stats:', error);
      throw error;
    }
  }
}

export default new PersistenceService();
