#!/bin/bash

# Local development setup script
# This script helps set up the development environment

set -e

echo "🚀 Tic-Tac-Toe Backend - Development Setup"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Go
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.21+"
    exit 1
fi
echo "✅ Go $(go version | awk '{print $3}')"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker"
    exit 1
fi
echo "✅ Docker $(docker --version | awk '{print $3}' | tr -d ',')"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed"
    exit 1
fi
echo "✅ Docker Compose $(docker-compose --version | awk '{print $4}' | tr -d ',')"

echo ""
echo "Installing dependencies..."

# Install Go dependencies
echo "📦 Installing Go modules..."
cd go-sockets
go mod download
cd ..
echo "✅ Go dependencies installed"

# Install Node.js dependencies
echo "📦 Installing Node.js packages..."
cd node-api
npm install
cd ..
echo "✅ Node.js dependencies installed"

# Setup environment
echo ""
echo "Setting up environment..."
cd infra
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file (please edit with your configuration)"
else
    echo "ℹ️  .env file already exists"
fi
cd ..

# Start development services
echo ""
echo "Starting development services (Redis, MongoDB)..."
cd infra
docker-compose -f docker-compose.dev.yml up -d
cd ..

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check service health
echo ""
echo "Checking service health..."

# Check Redis
if docker-compose -f infra/docker-compose.dev.yml exec -T redis redis-cli PING &> /dev/null; then
    echo "✅ Redis is running"
else
    echo "❌ Redis is not responding"
fi

# Check MongoDB
if docker-compose -f infra/docker-compose.dev.yml exec -T mongo mongosh --eval "db.runCommand({ping:1})" --quiet &> /dev/null; then
    echo "✅ MongoDB is running"
else
    echo "⚠️  MongoDB may not be ready yet"
fi

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit infra/.env with your configuration"
echo "   - MONGO_URL (or use local: mongodb://localhost:27017)"
echo "   - ALLOWED_ORIGINS for CORS"
echo ""
echo "2. Start the Go WebSocket server:"
echo "   cd go-sockets && go run main.go"
echo ""
echo "3. Start the Node.js API (in another terminal):"
echo "   cd node-api && npm run dev"
echo ""
echo "4. Test the API:"
echo "   curl http://localhost:3000/health"
echo ""
echo "5. Run tests:"
echo "   make test-all"
echo ""
echo "Useful commands:"
echo "  make help              - Show all available commands"
echo "  make infra-logs        - View service logs"
echo "  make redis-cli         - Connect to Redis CLI"
echo "  make test-e2e          - Run end-to-end tests"
echo ""
echo "Services running:"
echo "  Redis:    localhost:6379"
echo "  MongoDB:  localhost:27017"
echo ""
