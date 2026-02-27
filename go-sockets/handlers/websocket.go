package handlers

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/yourusername/tictactoe-backend/go-sockets/ws"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     nil, // Will be set in NewWebSocketHandler
}

type WebSocketHandler struct {
	manager        *ws.Manager
	allowedOrigins map[string]bool
}

func NewWebSocketHandler(manager *ws.Manager, allowedOrigins []string) *WebSocketHandler {
	// Build allowed origins map
	originsMap := make(map[string]bool)
	allowAll := false
	for _, origin := range allowedOrigins {
		if origin == "*" {
			allowAll = true
		}
		originsMap[origin] = true
	}

	// Set CheckOrigin function
	upgrader.CheckOrigin = func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Allow same-origin requests
		}

		// Allow all origins if "*" was specified
		if allowAll {
			return true
		}

		allowed := originsMap[origin]
		if !allowed {
			log.Printf("[WEBSOCKET] Rejected connection from unauthorized origin: %s", origin)
		}
		return allowed
	}

	return &WebSocketHandler{
		manager:        manager,
		allowedOrigins: originsMap,
	}
}

func (h *WebSocketHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Get query parameters
	gameID := r.URL.Query().Get("gameId")
	playerID := r.URL.Query().Get("playerId")

	if gameID == "" || playerID == "" {
		log.Println("[WEBSOCKET] Missing gameId or playerId in query params")
		http.Error(w, "Missing gameId or playerId", http.StatusBadRequest)
		return
	}

	// Upgrade connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WEBSOCKET] Failed to upgrade connection: %v", err)
		return
	}

	log.Printf("[WEBSOCKET] New connection for game %s, player %s from %s", gameID, playerID, r.RemoteAddr)

	// Create client
	client := ws.NewClient(h.manager, conn, gameID, playerID)

	// Register client
	h.manager.RegisterClient(client)

	// Start client goroutines
	go client.WritePump()
	go client.ReadPump()

	// Send initial game state
	go func() {
		gameState, err := h.manager.GetGameState(gameID)
		if err != nil {
			log.Printf("[WEBSOCKET] Failed to get initial game state: %v", err)
			return
		}

		stateMsg, err := ws.StateMessage(gameID, gameState)
		if err != nil {
			log.Printf("[WEBSOCKET] Failed to create state message: %v", err)
			return
		}

		client.SendMessage(stateMsg)
	}()
}

// Add helper method to Client
func (h *WebSocketHandler) RegisterClient(client *ws.Client) {
	h.manager.RegisterClient(client)
}
