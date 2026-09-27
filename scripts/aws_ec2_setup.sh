#!/usr/bin/env bash
# ==============================================================================
# Dinely AWS EC2 Instance Provisioning & Bootstrap Script
# Target OS: Ubuntu 24.04 LTS (ap-south-1 Mumbai)
# Instance Type: t3.medium (EBS gp3)
# ==============================================================================

set -euo pipefail

echo "=================================================================="
echo "          DINELY AWS EC2 BOOTSTRAP: INITIALIZING                 "
echo "=================================================================="

# 1. Update and install base packages
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    htop \
    ufw

# 2. Install official Docker and Docker Compose plugin
if ! command -v docker &> /dev/null; then
    echo "[*] Installing official Docker engine..."
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Enable and start Docker service
    sudo systemctl enable docker
    sudo systemctl start docker

    # Add current user to docker group
    sudo usermod -aG docker "$USER"
    echo "[+] Docker installed successfully: $(docker --version)"
fi

# 3. Configure Local Firewall (UFW)
# Allow SSH (port 22) and HTTP (port 80 from ALB)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment "SSH administration"
sudo ufw allow 80/tcp comment "HTTP from ALB"
sudo ufw --force enable

echo "[+] Firewall configured. Listening for ALB on port 80."

# 4. Create App Directory
APP_DIR="/opt/dinely"
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"

echo "=================================================================="
echo "  EC2 Instance prepared. Ready for codebase clone and deployment. "
echo "  Directory: $APP_DIR"
echo "=================================================================="
