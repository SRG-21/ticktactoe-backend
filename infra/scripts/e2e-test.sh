#!/bin/bash

# End-to-end test script for Tic-Tac-Toe backend
# Tests the complete flow: register → create → join → move → win

set -e

API_URL=${API_URL:-"http://localhost:3000"}
WS_URL=${WS_URL:-"ws://localhost:8080"}

echo "Running E2E tests against $API_URL..."

# Test 1: Health check
echo "Test 1: Health check..."
HEALTH=$(curl -s "$API_URL/health")
if [ "$HEALTH" != "ok" ]; then
    echo "❌ Health check failed"
    exit 1
fi
echo "✅ Health check passed"

# Test 2: Register player 1
echo "Test 2: Register player 1..."
PLAYER1=$(curl -s -X POST "$API_URL/api/register")
PLAYER1_ID=$(echo $PLAYER1 | jq -r '.playerId')
PLAYER1_TOKEN=$(echo $PLAYER1 | jq -r '.token')

if [ -z "$PLAYER1_ID" ] || [ "$PLAYER1_ID" == "null" ]; then
    echo "❌ Failed to register player 1"
    exit 1
fi
echo "✅ Player 1 registered: $PLAYER1_ID"

# Test 3: Register player 2
echo "Test 3: Register player 2..."
PLAYER2=$(curl -s -X POST "$API_URL/api/register")
PLAYER2_ID=$(echo $PLAYER2 | jq -r '.playerId')
PLAYER2_TOKEN=$(echo $PLAYER2 | jq -r '.token')

if [ -z "$PLAYER2_ID" ] || [ "$PLAYER2_ID" == "null" ]; then
    echo "❌ Failed to register player 2"
    exit 1
fi
echo "✅ Player 2 registered: $PLAYER2_ID"

# Test 4: Validate token
echo "Test 4: Validate token..."
VALID=$(curl -s -X POST "$API_URL/api/validate" \
    -H "Content-Type: application/json" \
    -d "{\"playerId\":\"$PLAYER1_ID\",\"token\":\"$PLAYER1_TOKEN\"}")
IS_VALID=$(echo $VALID | jq -r '.valid')

if [ "$IS_VALID" != "true" ]; then
    echo "❌ Token validation failed"
    exit 1
fi
echo "✅ Token validation passed"

# Test 5: Create game
echo "Test 5: Create game..."
GAME=$(curl -s -X POST "$API_URL/api/create" \
    -H "Content-Type: application/json" \
    -d "{\"playerId\":\"$PLAYER1_ID\",\"token\":\"$PLAYER1_TOKEN\"}")
GAME_ID=$(echo $GAME | jq -r '.gameId')

if [ -z "$GAME_ID" ] || [ "$GAME_ID" == "null" ]; then
    echo "❌ Failed to create game"
    exit 1
fi
echo "✅ Game created: $GAME_ID"

# Test 6: Join game
echo "Test 6: Join game..."
JOIN=$(curl -s -X POST "$API_URL/api/join" \
    -H "Content-Type: application/json" \
    -d "{\"gameId\":\"$GAME_ID\",\"playerId\":\"$PLAYER2_ID\",\"token\":\"$PLAYER2_TOKEN\"}")
SYMBOL=$(echo $JOIN | jq -r '.symbol')

if [ "$SYMBOL" != "O" ]; then
    echo "❌ Failed to join game"
    exit 1
fi
echo "✅ Player 2 joined as O"

# Test 7: Get game state
echo "Test 7: Get game state..."
STATE=$(curl -s "$API_URL/api/games/$GAME_ID")
STATUS=$(echo $STATE | jq -r '.status')

if [ "$STATUS" != "playing" ]; then
    echo "❌ Game status should be 'playing', got '$STATUS'"
    exit 1
fi
echo "✅ Game state retrieved successfully"

# Test 8: List active games
echo "Test 8: List active games..."
GAMES=$(curl -s "$API_URL/api/games")
COUNT=$(echo $GAMES | jq -r '.count')

if [ "$COUNT" -lt 1 ]; then
    echo "❌ Should have at least 1 active game"
    exit 1
fi
echo "✅ Found $COUNT active game(s)"

echo ""
echo "🎉 All E2E tests passed!"
echo ""
echo "Game ID: $GAME_ID"
echo "Player 1 (X): $PLAYER1_ID"
echo "Player 2 (O): $PLAYER2_ID"
echo ""
echo "Connect to WebSocket:"
echo "  $WS_URL/ws?gameId=$GAME_ID&playerId=$PLAYER1_ID"
