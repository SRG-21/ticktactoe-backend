#!/bin/bash

# Deployment script for Tic-Tac-Toe backend
# Pulls latest code and restarts services

set -e

echo "Starting deployment..."

# Navigate to project directory
cd "$(dirname "$0")/../.."

# Pull latest code
echo "Pulling latest code from Git..."
git pull origin main

# Navigate to infra directory
cd infra

# Rebuild Docker images
echo "Building Docker images..."
docker-compose build --no-cache

# Stop old containers
echo "Stopping old containers..."
docker-compose down

# Start new containers
echo "Starting new containers..."
docker-compose up -d

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
sleep 10

# Check service status
echo "Service status:"
docker-compose ps

# Show logs
echo ""
echo "Recent logs:"
docker-compose logs --tail=50

# Cleanup old images
echo ""
echo "Cleaning up old Docker images..."
docker image prune -f

echo ""
echo "Deployment complete!"
echo "View logs: docker-compose logs -f"
echo "Check status: docker-compose ps"
