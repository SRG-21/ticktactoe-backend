package ws

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	goredis "github.com/redis/go-redis/v9"  // Use alias to avoid naming conflict
	redisClient "github.com/yourusername/tictactoe-backend/go-sockets/redis"
)

type Manager struct {
	clients     map[string]map[*Client]bool // gameId -> clients
	register    chan *Client
	unregister  chan *Client
	pubsubs     map[string]*goredis.PubSub  // Use goredis.PubSub
	redis       *redisClient.Client
	mu          sync.RWMutex
	nodeAPIURL  string
}

func NewManager(redis *redisClient.Client, nodeAPIURL string) *Manager {
	return &Manager{
		clients:    make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		pubsubs:    make(map[string]*goredis.PubSub),  // Use goredis.PubSub
		redis:      redis,
		nodeAPIURL: nodeAPIURL,
	}
}

func (m *Manager) Run() {
	log.Println("[MANAGER] WebSocket manager started")

	for {
		select {
		case client := <-m.register:
			m.registerClient(client)

		case client := <-m.unregister:
			m.unregisterClient(client)
		}
	}
}

func (m *Manager) registerClient(client *Client) {
	m.mu.Lock()
	gameID := client.gameID

	// Initialize game room if it doesn't exist
	if _, ok := m.clients[gameID]; !ok {
		m.clients[gameID] = make(map[*Client]bool)
		log.Printf("[MANAGER] Created new game room: %s", gameID)
	}

	// Add client to game room
	m.clients[gameID][client] = true
	clientCount := len(m.clients[gameID])
	log.Printf("[MANAGER] Client registered to game %s (total: %d)", gameID, clientCount)

	// Subscribe to game events if this is the first client
	if clientCount == 1 {
		m.subscribeToGame(gameID)
	}

	m.mu.Unlock()

	// If second player joined, broadcast updated state to ALL players
	if clientCount == 2 {
		go m.notifyGameStart(gameID)
	}
}

func (m *Manager) unregisterClient(client *Client) {
	m.mu.Lock()
	defer m.mu.Unlock()

	gameID := client.gameID

	if clients, ok := m.clients[gameID]; ok {
		if _, exists := clients[client]; exists {
			delete(clients, client)
			close(client.send)
			log.Printf("[MANAGER] Client unregistered from game %s (remaining: %d)", gameID, len(clients))

			// Clean up empty game room
			if len(clients) == 0 {
				delete(m.clients, gameID)
				m.unsubscribeFromGame(gameID)
				log.Printf("[MANAGER] Game room %s cleaned up", gameID)
			}
		}
	}
}

func (m *Manager) subscribeToGame(gameID string) {
	ctx := context.Background()
	pubsub := m.redis.Subscribe(ctx, gameID)
	m.pubsubs[gameID] = pubsub

	log.Printf("[MANAGER] Subscribed to game events: %s", gameID)

	// Start listening to pub/sub messages in a goroutine
	go m.listenToGameEvents(gameID, pubsub)
}

func (m *Manager) unsubscribeFromGame(gameID string) {
	if pubsub, ok := m.pubsubs[gameID]; ok {
		pubsub.Close()
		delete(m.pubsubs, gameID)
		log.Printf("[MANAGER] Unsubscribed from game events: %s", gameID)
	}
}

func (m *Manager) listenToGameEvents(gameID string, pubsub *goredis.PubSub) {
	ch := pubsub.Channel()

	for msg := range ch {
		// Parse the message
		var event map[string]interface{}
		if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
			log.Printf("[MANAGER] Failed to parse pub/sub message: %v", err)
			continue
		}

		log.Printf("[MANAGER] Received event for game %s: %s", gameID, event["type"])

		// Broadcast to all clients in the game
		m.broadcastToGame(gameID, []byte(msg.Payload))

		// If game finished, persist to MongoDB
		if eventType, ok := event["type"].(string); ok && eventType == "move_applied" {
			if status, ok := event["status"].(string); ok && status == "finished" {
				go m.persistFinishedGame(event)
			}
		}
	}
}

func (m *Manager) broadcastToGame(gameID string, message []byte) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if clients, ok := m.clients[gameID]; ok {
		for client := range clients {
			select {
			case client.send <- message:
			default:
				// Client's send channel is full, close it
				close(client.send)
				delete(clients, client)
			}
		}
	}
}

func (m *Manager) persistFinishedGame(event map[string]interface{}) {
	// This will be called by the Go server to POST to Node API
	// For now, just log - the actual HTTP call will be in the handler
	log.Printf("[MANAGER] Game finished, should persist: %v", event["gameId"])
}

// notifyGameStart broadcasts the game state to all players when second player joins
func (m *Manager) notifyGameStart(gameID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Get current game state from Redis
	gameState, err := m.redis.GetGameState(ctx, gameID)
	if err != nil {
		log.Printf("[MANAGER] Failed to get game state for broadcast: %v", err)
		return
	}

	// Create state message
	stateMsg, err := StateMessage(gameID, gameState)
	if err != nil {
		log.Printf("[MANAGER] Failed to create state message: %v", err)
		return
	}

	// Marshal to JSON bytes
	data, err := json.Marshal(stateMsg)
	if err != nil {
		log.Printf("[MANAGER] Failed to marshal state message: %v", err)
		return
	}

	// Broadcast to all clients in the game
	log.Printf("[MANAGER] Broadcasting game start to all players in game %s", gameID)
	m.broadcastToGame(gameID, data)
}

// RegisterClient is a wrapper for manager.register channel
func (m *Manager) RegisterClient(client *Client) {
	m.register <- client
}

func (m *Manager) GetGameState(gameID string) (map[string]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return m.redis.GetGameState(ctx, gameID)
}

func (m *Manager) ValidateMove(gameID, playerID, moveID string, cell int) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check rate limit
	rateLimited, err := m.redis.CheckRateLimit(ctx, gameID, playerID)
	if err != nil {
		return nil, err
	}
	if rateLimited {
		return nil, &RateLimitError{}
	}

	// Execute move validation
	return m.redis.ValidateMove(ctx, gameID, playerID, moveID, cell)
}

// Custom error types
type RateLimitError struct{}

func (e *RateLimitError) Error() string {
	return "RATE_LIMITED"
}

// GetClientCount returns the number of clients in a game
func (m *Manager) GetClientCount(gameID string) int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if clients, ok := m.clients[gameID]; ok {
		return len(clients)
	}
	return 0
}
