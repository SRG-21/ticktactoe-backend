import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const API_URL = process.env.API_URL || 'http://localhost:3000';

describe('Tic-Tac-Toe API Tests', () => {
  let playerId1, token1;
  let playerId2, token2;
  let gameId;

  beforeAll(async () => {
    // Wait for API to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('Health check should return OK', async () => {
    const response = await fetch(`${API_URL}/health`);
    const text = await response.text();
    
    expect(response.status).toBe(200);
    expect(text).toBe('ok');
  });

  test('Register player 1', async () => {
    const response = await fetch(`${API_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    
    expect(response.status).toBe(201);
    expect(data).toHaveProperty('playerId');
    expect(data).toHaveProperty('token');
    expect(data.playerId).toMatch(/^p-/);

    playerId1 = data.playerId;
    token1 = data.token;
  });

  test('Register player 2', async () => {
    const response = await fetch(`${API_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    
    expect(response.status).toBe(201);
    playerId2 = data.playerId;
    token2 = data.token;
  });

  test('Validate token should succeed', async () => {
    const response = await fetch(`${API_URL}/api/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerId1, token: token1 }),
    });

    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.valid).toBe(true);
  });

  test('Validate invalid token should fail', async () => {
    const response = await fetch(`${API_URL}/api/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerId1, token: 'invalid-token' }),
    });

    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.valid).toBe(false);
  });

  test('Create game', async () => {
    const response = await fetch(`${API_URL}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerId1, token: token1 }),
    });

    const data = await response.json();
    
    expect(response.status).toBe(201);
    expect(data).toHaveProperty('gameId');
    expect(data.gameId).toHaveLength(6);

    gameId = data.gameId;
  });

  test('Join game', async () => {
    const response = await fetch(`${API_URL}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        gameId, 
        playerId: playerId2, 
        token: token2 
      }),
    });

    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.symbol).toBe('O');
  });

  test('Get game state', async () => {
    const response = await fetch(`${API_URL}/api/games/${gameId}`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.gameId).toBe(gameId);
    expect(data.status).toBe('playing');
    expect(data.board).toHaveLength(9);
  });

  test('Join non-existent game should fail', async () => {
    const response = await fetch(`${API_URL}/api/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        gameId: 'INVALID', 
        playerId: playerId2, 
        token: token2 
      }),
    });
    
    expect(response.status).toBe(404);
  });

  test('Create game without auth should fail', async () => {
    const response = await fetch(`${API_URL}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: playerId1, token: 'wrong-token' }),
    });
    
    expect(response.status).toBe(401);
  });
});
