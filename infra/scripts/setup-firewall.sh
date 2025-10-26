#!/bin/bash

# Setup Oracle Cloud firewall rules for HTTP/HTTPS traffic

set -e

echo "Setting up firewall rules..."

# Allow HTTP (port 80)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT

# Allow HTTPS (port 443)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# Save rules
if command -v netfilter-persistent &> /dev/null; then
    sudo netfilter-persistent save
    echo "Firewall rules saved using netfilter-persistent"
elif command -v iptables-save &> /dev/null; then
    sudo iptables-save | sudo tee /etc/iptables/rules.v4
    echo "Firewall rules saved to /etc/iptables/rules.v4"
else
    echo "Warning: Could not find tool to persist iptables rules"
    echo "Rules will be lost on reboot"
fi

# Display current rules
echo ""
echo "Current firewall rules:"
sudo iptables -L INPUT -n --line-numbers | grep -E "80|443"

echo ""
echo "Firewall setup complete!"
echo "Ports 80 and 443 are now open"
