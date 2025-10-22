package ws

import (
	"encoding/json"
	"testing"
)

func TestClientMessageParsing(t *testing.T) {
	tests := []struct {
		name    string
		json    string
		wantErr bool
	}{
		{
			name:    "valid move message",
			json:    `{"type":"move","gameId":"ABC123","playerId":"p-123","moveId":"m-456","cell":4}`,
			wantErr: false,
		},
		{
			name:    "valid join message",
			json:    `{"type":"join","gameId":"ABC123","playerId":"p-123","token":"xxx"}`,
			wantErr: false,
		},
		{
			name:    "valid reconnect message",
			json:    `{"type":"reconnect","gameId":"ABC123","playerId":"p-123","token":"xxx"}`,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var msg ClientMessage
			err := json.Unmarshal([]byte(tt.json), &msg)
			
			if (err != nil) != tt.wantErr {
				t.Errorf("Unmarshal() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestErrorMessage(t *testing.T) {
	msg := ErrorMessage("TEST_ERROR", "This is a test error")
	
	if msg.Type != "error" {
		t.Errorf("Expected type 'error', got %s", msg.Type)
	}
	
	if msg.Code != "TEST_ERROR" {
		t.Errorf("Expected code 'TEST_ERROR', got %s", msg.Code)
	}
	
	if msg.Message != "This is a test error" {
		t.Errorf("Expected message 'This is a test error', got %s", msg.Message)
	}
}

func TestStateMessage(t *testing.T) {
	gameState := map[string]string{
		"board":         `["X","O","X","","","","","",""]`,
		"playerSymbols": `{"p-1":"X","p-2":"O"}`,
		"turn":          "p-1",
		"status":        "playing",
	}
	
	msg, err := StateMessage("TEST123", gameState)
	if err != nil {
		t.Fatalf("StateMessage() error = %v", err)
	}
	
	if msg.Type != "state" {
		t.Errorf("Expected type 'state', got %s", msg.Type)
	}
	
	if msg.GameID != "TEST123" {
		t.Errorf("Expected gameId 'TEST123', got %s", msg.GameID)
	}
	
	if len(msg.Board) != 9 {
		t.Errorf("Expected board length 9, got %d", len(msg.Board))
	}
	
	if msg.Board[0] != "X" {
		t.Errorf("Expected board[0] 'X', got %s", msg.Board[0])
	}
}
