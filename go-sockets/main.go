package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/yourusername/tictactoe-backend/go-sockets/config"
	"github.com/yourusername/tictactoe-backend/go-sockets/handlers"
	"github.com/yourusername/tictactoe-backend/go-sockets/redis"
	"github.com/yourusername/tictactoe-backend/go-sockets/ws"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize Redis client
	redisClient, err := redis.NewClient(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[MAIN] Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()

	log.Println("[MAIN] Redis client initialized")

	// Create WebSocket manager
	manager := ws.NewManager(redisClient, cfg.NodeAPIURL)
	go manager.Run()

	log.Println("[MAIN] WebSocket manager started")

	// Create HTTP handlers
	wsHandler := handlers.NewWebSocketHandler(manager, cfg.AllowedOrigins)

	// Setup routes
	http.HandleFunc("/health", handlers.Health)
	http.Handle("/ws", wsHandler)

	// Start HTTP server
	addr := ":" + cfg.Port
	server := &http.Server{
		Addr:    addr,
		Handler: http.DefaultServeMux,
	}

	// Graceful shutdown
	go func() {
		log.Printf("[MAIN] Starting server on %s", addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[MAIN] Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[MAIN] Shutting down server...")
	server.Close()
	log.Println("[MAIN] Server stopped")
}
