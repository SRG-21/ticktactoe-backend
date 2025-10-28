#!/bin/bash

# Renew Let's Encrypt certificate and reload nginx
# Add to crontab: 0 3 * * * /path/to/renew-cron.sh

set -e

cd "$(dirname "$0")/.."

echo "Checking for certificate renewal..."

# Try to renew certificate
docker-compose run --rm certbot renew

# Reload nginx if renewal was successful
if [ $? -eq 0 ]; then
    echo "Certificate renewed, reloading nginx..."
    docker-compose exec nginx nginx -s reload
    echo "nginx reloaded"
else
    echo "No renewal needed or renewal failed"
fi

echo "Certificate check complete"
