package redis

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb              *redis.Client
	moveValidatorSHA string
}

func NewClient(url string) (*Client, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	rdb := redis.NewClient(opt)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	log.Printf("[REDIS] Connected to Redis at %s", opt.Addr)

	client := &Client{rdb: rdb}

	// Load Lua script
	if err := client.loadMoveValidatorScript(); err != nil {
		return nil, fmt.Errorf("failed to load Lua script: %w", err)
	}

	return client, nil
}

func (c *Client) loadMoveValidatorScript() error {
	ctx := context.Background()

	// Read Lua script file
	script, err := os.ReadFile("redis/move_validator.lua")
	if err != nil {
		return fmt.Errorf("failed to read Lua script: %w", err)
	}

	// Load script and get SHA
	sha, err := c.rdb.ScriptLoad(ctx, string(script)).Result()
	if err != nil {
		return fmt.Errorf("failed to load Lua script: %w", err)
	}

	c.moveValidatorSHA = sha
	log.Printf("[REDIS] Loaded move validator script with SHA: %s", sha)

	return nil
}

// ValidateMove executes the atomic move validation Lua script
func (c *Client) ValidateMove(ctx context.Context, gameID, playerID, moveID string, cell int) (map[string]interface{}, error) {
	timestamp := time.Now().Unix()

	keys := []string{
		fmt.Sprintf("game:%s", gameID),
		fmt.Sprintf("game:%s:moves", gameID),
	}
	args := []interface{}{playerID, moveID, cell, timestamp}

	result, err := c.rdb.EvalSha(ctx, c.moveValidatorSHA, keys, args...).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to execute move validator: %w", err)
	}

	// Parse result - Lua returns array format: ['key1', 'value1', 'key2', 'value2']
	resultSlice, ok := result.([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected result type from Lua script: %T", result)
	}

	// Convert array to map
	converted := make(map[string]interface{})
	for i := 0; i < len(resultSlice); i += 2 {
		if i+1 < len(resultSlice) {
			keyStr, ok := resultSlice[i].(string)
			if !ok {
				continue
			}
			converted[keyStr] = resultSlice[i+1]
		}
	}

	// Check for error
	if errMsg, hasErr := converted["err"]; hasErr {
		return nil, fmt.Errorf("%v", errMsg)
	}

	return converted, nil
}

// CheckRateLimit checks if a player is rate limited for a game
func (c *Client) CheckRateLimit(ctx context.Context, gameID, playerID string) (bool, error) {
	key := fmt.Sprintf("ratelimit:%s:%s", gameID, playerID)

	// Try to set key with 250ms TTL
	success, err := c.rdb.SetNX(ctx, key, "1", 250*time.Millisecond).Result()
	if err != nil {
		return false, err
	}

	return !success, nil // true if rate limited (key already exists)
}

// GetGameState retrieves the current game state
func (c *Client) GetGameState(ctx context.Context, gameID string) (map[string]string, error) {
	key := fmt.Sprintf("game:%s", gameID)
	return c.rdb.HGetAll(ctx, key).Result()
}

// Subscribe creates a new pub/sub subscription for a game
func (c *Client) Subscribe(ctx context.Context, gameID string) *redis.PubSub {
	channel := fmt.Sprintf("game:%s:events", gameID)
	return c.rdb.Subscribe(ctx, channel)
}

// Close closes the Redis connection
func (c *Client) Close() error {
	return c.rdb.Close()
}

// GetClient returns the underlying Redis client for custom operations
func (c *Client) GetClient() *redis.Client {
	return c.rdb
}
