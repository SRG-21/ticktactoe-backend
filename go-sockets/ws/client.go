package ws

import (
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = 54 * time.Second

	// Maximum message size allowed from peer
	maxMessageSize = 512
)

type Client struct {
	manager  *Manager
	conn     *websocket.Conn
	send     chan []byte
	gameID   string
	playerID string
	id       string
}

func NewClient(manager *Manager, conn *websocket.Conn, gameID, playerID string) *Client {
	return &Client{
		manager:  manager,
		conn:     conn,
		send:     make(chan []byte, 256),
		gameID:   gameID,
		playerID: playerID,
		id:       uuid.New().String(),
	}
}

// ReadPump pumps messages from the websocket connection to the manager
func (c *Client) ReadPump() {
	defer func() {
		c.manager.unregister <- c
		c.conn.Close()
		log.Printf("[CLIENT] ReadPump closed for player %s in game %s", c.playerID, c.gameID)
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[CLIENT] WebSocket error: %v", err)
			}
			break
		}

		// Parse message
		var msg ClientMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("[CLIENT] Failed to parse message: %v", err)
			c.sendError("INVALID_MESSAGE", "Failed to parse message")
			continue
		}

		// Handle message based on type
		c.handleMessage(&msg)
	}
}

// WritePump pumps messages from the manager to the websocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
		log.Printf("[CLIENT] WritePump closed for player %s in game %s", c.playerID, c.gameID)
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Manager closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current websocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(msg *ClientMessage) {
	log.Printf("[CLIENT] Received message type '%s' from player %s in game %s", msg.Type, c.playerID, c.gameID)

	switch msg.Type {
	case "move":
		c.handleMove(msg)
	case "reconnect":
		c.handleReconnect(msg)
	case "ping":
		// Handle ping/pong for keepalive
		c.sendMessage(&ServerMessage{Type: "pong"})
	default:
		log.Printf("[CLIENT] Unknown message type: %s", msg.Type)
		c.sendError("UNKNOWN_MESSAGE_TYPE", "Unknown message type: "+msg.Type)
	}
}

func (c *Client) handleMove(msg *ClientMessage) {
	// Validate required fields
	if msg.GameID == "" || msg.PlayerID == "" || msg.MoveID == "" {
		c.sendError("INVALID_MESSAGE", "Missing required fields")
		return
	}

	// Validate cell range
	if msg.Cell < 0 || msg.Cell > 8 {
		c.sendError("INVALID_CELL", "Cell must be between 0 and 8")
		return
	}

	// Execute move via manager (which uses Redis Lua script)
	result, err := c.manager.ValidateMove(msg.GameID, msg.PlayerID, msg.MoveID, msg.Cell)
	if err != nil {
		// Handle specific errors
		switch err.Error() {
		case "RATE_LIMITED":
			c.sendError("RATE_LIMITED", "Please wait before making another move")
		case "GAME_NOT_FOUND":
			c.sendError("GAME_NOT_FOUND", "Game not found")
		case "GAME_FINISHED":
			c.sendError("GAME_FINISHED", "Game already finished")
		case "NOT_YOUR_TURN":
			c.sendError("NOT_YOUR_TURN", "Wait for your turn")
		case "CELL_OCCUPIED":
			c.sendError("CELL_OCCUPIED", "Cell already occupied")
		default:
			log.Printf("[CLIENT] Move validation error: %v", err)
			c.sendError("MOVE_FAILED", err.Error())
		}
		return
	}

	log.Printf("[CLIENT] Move applied successfully for player %s in game %s", msg.PlayerID, msg.GameID)

	// The Redis Lua script publishes the event, which the manager will broadcast
	// So we don't need to send anything here - the pub/sub will handle it
	_ = result
}

func (c *Client) handleReconnect(msg *ClientMessage) {
	// Get current game state from Redis
	gameState, err := c.manager.GetGameState(msg.GameID)
	if err != nil {
		log.Printf("[CLIENT] Failed to get game state: %v", err)
		c.sendError("RECONNECT_FAILED", "Failed to retrieve game state")
		return
	}

	// Send current state to client
	stateMsg, err := StateMessage(msg.GameID, gameState)
	if err != nil {
		log.Printf("[CLIENT] Failed to create state message: %v", err)
		c.sendError("RECONNECT_FAILED", "Failed to create state message")
		return
	}

	c.sendMessage(stateMsg)
	log.Printf("[CLIENT] Sent reconnection state for game %s to player %s", msg.GameID, msg.PlayerID)
}

func (c *Client) sendMessage(msg *ServerMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[CLIENT] Failed to marshal message: %v", err)
		return
	}

	select {
	case c.send <- data:
	default:
		log.Printf("[CLIENT] Send channel full, dropping message")
	}
}

func (c *Client) sendError(code, message string) {
	c.sendMessage(ErrorMessage(code, message))
}

// SendMessage is a public method to send messages to the client
func (c *Client) SendMessage(msg *ServerMessage) {
	c.sendMessage(msg)
}
