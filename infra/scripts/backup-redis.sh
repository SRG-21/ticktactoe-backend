#!/bin/bash

# Backup Redis data using BGSAVE

set -e

BACKUP_DIR="/home/ubuntu/backups/redis"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "Starting Redis backup..."

# Create backup directory
mkdir -p $BACKUP_DIR

# Trigger Redis background save
docker-compose exec -T redis redis-cli BGSAVE

# Wait for save to complete
while [ $(docker-compose exec -T redis redis-cli LASTSAVE) -eq $(docker-compose exec -T redis redis-cli LASTSAVE) ]; do
    sleep 1
done

# Copy dump file
docker cp tictactoe-redis:/data/dump.rdb $BACKUP_DIR/dump_$TIMESTAMP.rdb

# Keep only last 7 backups
ls -t $BACKUP_DIR/dump_*.rdb | tail -n +8 | xargs -r rm

echo "Backup complete: $BACKUP_DIR/dump_$TIMESTAMP.rdb"
echo "Kept last 7 backups"
