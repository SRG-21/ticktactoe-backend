package ws

import "encoding/json"

// Message types from client
type ClientMessage struct {
	Type     string `json:"type"`
	GameID   string `json:"gameId,omitempty"`
	PlayerID string `json:"playerId,omitempty"`
	Token    string `json:"token,omitempty"`
	MoveID   string `json:"moveId,omitempty"`
	Cell     int    `json:"cell,omitempty"`
}

// Message types to client
type ServerMessage struct {
	Type        string                 `json:"type"`
	GameID      string                 `json:"gameId,omitempty"`
	Board       []string               `json:"board,omitempty"`
	Turn        string                 `json:"turn,omitempty"`
	Status      string                 `json:"status,omitempty"`
	Players     map[string]string      `json:"players,omitempty"`
	PlayerID    string                 `json:"playerId,omitempty"`
	Cell        int                    `json:"cell,omitempty"`
	Result      string                 `json:"result,omitempty"`
	Winner      string                 `json:"winner,omitempty"`
	WinningLine []int                  `json:"winningLine,omitempty"`
	Code        string                 `json:"code,omitempty"`
	Message     string                 `json:"message,omitempty"`
	Data        map[string]interface{} `json:"data,omitempty"`
}

// ErrorMessage creates an error message
func ErrorMessage(code, message string) *ServerMessage {
	return &ServerMessage{
		Type:    "error",
		Code:    code,
		Message: message,
	}
}

// StateMessage creates a state message from game data
func StateMessage(gameID string, gameState map[string]string) (*ServerMessage, error) {
	// Parse board
	var board []string
	if boardStr, ok := gameState["board"]; ok {
		if err := json.Unmarshal([]byte(boardStr), &board); err != nil {
			board = make([]string, 9)
		}
	} else {
		board = make([]string, 9)
	}

	// Parse players
	var players map[string]string
	if playersStr, ok := gameState["playerSymbols"]; ok {
		if err := json.Unmarshal([]byte(playersStr), &players); err != nil {
			players = make(map[string]string)
		}
	} else {
		players = make(map[string]string)
	}

	return &ServerMessage{
		Type:    "state",
		GameID:  gameID,
		Board:   board,
		Turn:    gameState["turn"],
		Status:  gameState["status"],
		Players: players,
	}, nil
}

// MoveAppliedMessage creates a move applied message
func MoveAppliedMessage(gameID, playerID string, cell int, state map[string]interface{}) (*ServerMessage, error) {
	// Parse board from state
	var board []string
	if boardData, ok := state["state"].(map[interface{}]interface{}); ok {
		if boardStr, ok := boardData["board"].(string); ok {
			json.Unmarshal([]byte(boardStr), &board)
		}
	}

	msg := &ServerMessage{
		Type:     "move_applied",
		GameID:   gameID,
		PlayerID: playerID,
		Cell:     cell,
		Board:    board,
	}

	// Add status and turn
	if stateData, ok := state["state"].(map[interface{}]interface{}); ok {
		if status, ok := stateData["status"].(string); ok {
			msg.Status = status
		}
		if turn, ok := stateData["turn"].(string); ok {
			msg.Turn = turn
		}
	}

	return msg, nil
}

// GameOverMessage creates a game over message
func GameOverMessage(gameID string, result, winner string, winningLine []int, board []string) *ServerMessage {
	return &ServerMessage{
		Type:        "game_over",
		GameID:      gameID,
		Result:      result,
		Winner:      winner,
		WinningLine: winningLine,
		Board:       board,
	}
}
