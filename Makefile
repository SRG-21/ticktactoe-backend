.PHONY: help build run test clean deploy

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development
dev-go: ## Run Go WebSocket server locally
	cd go-sockets && go run main.go

dev-node: ## Run Node.js API locally
	cd node-api && npm run dev

dev-redis: ## Start local Redis container
	docker run -d --name tictactoe-redis -p 6379:6379 redis:7-alpine redis-server --appendonly yes

dev-stop: ## Stop local Redis container
	docker stop tictactoe-redis && docker rm tictactoe-redis

# Testing
test-go: ## Run Go tests
	cd go-sockets && go test ./... -v

test-node: ## Run Node.js tests
	cd node-api && npm test

test-e2e: ## Run end-to-end tests
	cd infra/scripts && bash e2e-test.sh

test-all: test-go test-node ## Run all tests

# Build
build-go: ## Build Go binary
	cd go-sockets && go build -o bin/tictactoe-sockets .

build-docker: ## Build Docker images
	cd infra && docker-compose build

# Deployment
deploy: ## Deploy to production
	cd infra/scripts && bash deploy.sh

deploy-tls: ## Setup TLS certificates
	cd infra/certbot && bash init-letsencrypt.sh

deploy-firewall: ## Setup Oracle Cloud firewall
	cd infra/scripts && sudo bash setup-firewall.sh

# Infrastructure
infra-up: ## Start all services with Docker Compose
	cd infra && docker-compose up -d

infra-down: ## Stop all services
	cd infra && docker-compose down

infra-logs: ## Show logs from all services
	cd infra && docker-compose logs -f

infra-ps: ## Show status of all services
	cd infra && docker-compose ps

infra-restart: ## Restart all services
	cd infra && docker-compose restart

# Maintenance
backup-redis: ## Backup Redis data
	cd infra/scripts && bash backup-redis.sh

clean: ## Clean build artifacts
	rm -rf go-sockets/bin
	rm -rf node-api/node_modules
	cd infra && docker-compose down -v

# Monitoring
logs-go: ## Show Go server logs
	cd infra && docker-compose logs -f go-sockets

logs-node: ## Show Node API logs
	cd infra && docker-compose logs -f node-api

logs-redis: ## Show Redis logs
	cd infra && docker-compose logs -f redis

logs-nginx: ## Show nginx logs
	cd infra && docker-compose logs -f nginx

# Database
redis-cli: ## Connect to Redis CLI
	cd infra && docker-compose exec redis redis-cli

redis-info: ## Show Redis info
	cd infra && docker-compose exec redis redis-cli INFO

# Quick commands
setup: ## Initial setup (install dependencies)
	cd go-sockets && go mod download
	cd node-api && npm install

lint-go: ## Run Go linter
	cd go-sockets && go vet ./...
	cd go-sockets && go fmt ./...

fmt-go: ## Format Go code
	cd go-sockets && go fmt ./...
