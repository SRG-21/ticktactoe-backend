package config

import (
	"log"
	"os"
	"strings"
)

type Config struct {
	Port           string
	RedisURL       string
	NodeAPIURL     string
	AllowedOrigins []string
	Environment    string
}

func Load() *Config {
	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),
		NodeAPIURL:  getEnv("NODE_API_URL", "http://localhost:3000"),
		Environment: getEnv("ENVIRONMENT", "development"),
	}

	// Parse allowed origins
	originsStr := getEnv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
	cfg.AllowedOrigins = strings.Split(originsStr, ",")

	log.Printf("[CONFIG] Loaded configuration:")
	log.Printf("[CONFIG] Port: %s", cfg.Port)
	log.Printf("[CONFIG] Redis URL: %s", cfg.RedisURL)
	log.Printf("[CONFIG] Node API URL: %s", cfg.NodeAPIURL)
	log.Printf("[CONFIG] Allowed Origins: %v", cfg.AllowedOrigins)
	log.Printf("[CONFIG] Environment: %s", cfg.Environment)

	return cfg
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}
