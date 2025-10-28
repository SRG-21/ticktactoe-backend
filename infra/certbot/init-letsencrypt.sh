#!/bin/bash

# Initialize Let's Encrypt certificate
# Run this script once during initial setup

set -e

# Load environment variables
source ../.env

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Error: DOMAIN and EMAIL must be set in .env file"
    exit 1
fi

echo "Setting up TLS certificate for $DOMAIN..."

# Create directories
mkdir -p ./conf/live/$DOMAIN
mkdir -p ./www

# Create dummy certificate for nginx to start
if [ ! -f "./conf/live/$DOMAIN/fullchain.pem" ]; then
    echo "Creating dummy certificate..."
    
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout ./conf/live/$DOMAIN/privkey.pem \
        -out ./conf/live/$DOMAIN/fullchain.pem \
        -subj "/CN=$DOMAIN"
fi

# Update nginx config with actual domain
sed -i "s/DOMAIN/$DOMAIN/g" ../nginx/nginx.conf

# Start nginx
echo "Starting nginx..."
docker-compose up -d nginx

# Wait for nginx to be ready
sleep 5

# Request real certificate
echo "Requesting Let's Encrypt certificate..."

docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN

# Reload nginx with real certificate
echo "Reloading nginx..."
docker-compose exec nginx nginx -s reload

echo "TLS setup complete!"
echo "Certificate will auto-renew via cron job"
