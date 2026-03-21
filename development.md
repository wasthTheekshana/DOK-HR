# DOK-HR System — Development & Deployment Guide

Complete guide for setting up the DOK-HR system in development and deploying to a Linux production server with Jenkins CI/CD and GitHub integration.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Local Development Setup](#2-local-development-setup)
3. [Environment Configuration](#3-environment-configuration)
4. [Linux Server Prerequisites](#4-linux-server-prerequisites)
5. [Oracle Database Setup](#5-oracle-database-setup)
6. [Application Deployment (Manual)](#6-application-deployment-manual)
7. [Nginx Configuration](#7-nginx-configuration)
8. [PM2 Process Management](#8-pm2-process-management)
9. [Jenkins Installation & Setup](#9-jenkins-installation--setup)
10. [GitHub Repository & Webhooks](#10-github-repository--webhooks)
11. [Jenkins Pipeline (Jenkinsfile)](#11-jenkins-pipeline-jenkinsfile)
12. [SSL / HTTPS with Let's Encrypt](#12-ssl--https-with-lets-encrypt)
13. [Firewall & Security](#13-firewall--security)
14. [Monitoring & Logs](#14-monitoring--logs)
15. [Rollback Procedure](#15-rollback-procedure)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Project Overview

### Stack

| Layer     | Technology                            |
|-----------|---------------------------------------|
| Frontend  | React 19, TypeScript, Vite, TailwindCSS v4, Recharts |
| Backend   | Node.js 20 LTS, Express 5, TypeScript |
| Database  | Oracle Database (node-oracledb)       |
| Auth      | JWT (jsonwebtoken)                    |
| Server    | Ubuntu 22.04 LTS / Debian 12          |
| Proxy     | Nginx                                 |
| Process   | PM2                                   |
| CI/CD     | Jenkins + GitHub Webhooks             |

### Directory Structure

```
DOK-HR/
├── client/          # React frontend (Vite)
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
├── server/          # Express backend
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── Jenkinsfile      # CI/CD pipeline definition
├── ecosystem.config.js  # PM2 config
└── development.md   # This file
```

---

## 2. Local Development Setup

### Prerequisites

- Node.js 20 LTS — https://nodejs.org
- npm 10+
- Oracle Instant Client (for node-oracledb)
- Git

### Clone and Install

```bash
git clone https://github.com/<your-org>/DOK-HR.git
cd DOK-HR

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Run in Development Mode

**Terminal 1 — Backend:**
```bash
cd server
npm run dev
# Server runs on http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
# Vite dev server runs on http://localhost:5173
```

The Vite dev server proxies `/api/*` requests to `http://localhost:5000` via `vite.config.ts`.

### Build for Production (local test)

```bash
# Build frontend
cd client
npm run build
# Output: client/dist/

# Build backend
cd server
npm run build
# Output: server/dist/
```

---

## 3. Environment Configuration

### Server Environment File

Create `server/.env`:

```env
# Oracle Database
DB_USER=hr_user
DB_PASSWORD=your_secure_password
DB_CONNECT_STRING=localhost:1521/XEPDB1

# JWT
JWT_SECRET=your_very_long_random_secret_key_here
JWT_EXPIRES_IN=8h

# App
PORT=5000
NODE_ENV=production
```

> **Security**: Never commit `.env` to Git. Add it to `.gitignore`.

### Client Environment File

Create `client/.env.production`:

```env
VITE_API_URL=/api
```

For local development, create `client/.env.development`:

```env
VITE_API_URL=http://localhost:5000/api
```

---

## 4. Linux Server Prerequisites

### System Update

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip build-essential
```

### Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v20.x.x
npm --version    # 10.x.x
```

### Install PM2

```bash
sudo npm install -g pm2
pm2 --version
```

### Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Install Oracle Instant Client

```bash
# Download Oracle Instant Client Basic + SDK (21.x) from Oracle website
# https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html

# Example using RPM method on Ubuntu via alien:
sudo apt install -y alien libaio1

# Or using ZIP method:
mkdir -p /opt/oracle
cd /opt/oracle
unzip instantclient-basic-linux.x64-21.x.x.x.x.zip
unzip instantclient-sdk-linux.x64-21.x.x.x.x.zip

# Set library path
echo /opt/oracle/instantclient_21_x | sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf
sudo ldconfig

# Set environment variables (add to /etc/environment or ~/.bashrc)
export LD_LIBRARY_PATH=/opt/oracle/instantclient_21_x:$LD_LIBRARY_PATH
export OCI_LIB_DIR=/opt/oracle/instantclient_21_x
export OCI_INC_DIR=/opt/oracle/instantclient_21_x/sdk/include
```

### Create Application User

```bash
sudo useradd -m -s /bin/bash dokhr
sudo usermod -aG sudo dokhr

# Create application directory
sudo mkdir -p /var/www/dokhr
sudo chown -R dokhr:dokhr /var/www/dokhr
```

---

## 5. Oracle Database Setup

### Connection String Format

```
host:port/service_name
# Example: 192.168.1.100:1521/XEPDB1
```

### Required Database User & Permissions

```sql
-- Run as SYSDBA
CREATE USER hr_user IDENTIFIED BY your_secure_password;
GRANT CONNECT, RESOURCE TO hr_user;
GRANT CREATE SESSION TO hr_user;
GRANT UNLIMITED TABLESPACE TO hr_user;
```

### Test Connection from Server

```bash
# Install sqlplus (part of Instant Client SQL*Plus package)
# Then test:
sqlplus hr_user/your_secure_password@192.168.1.100:1521/XEPDB1
```

---

## 6. Application Deployment (Manual)

### Clone Repository on Server

```bash
sudo -u dokhr bash
cd /var/www/dokhr
git clone https://github.com/<your-org>/DOK-HR.git app
cd app
```

### Create Environment File

```bash
cat > /var/www/dokhr/app/server/.env << 'EOF'
DB_USER=hr_user
DB_PASSWORD=your_secure_password
DB_CONNECT_STRING=192.168.1.100:1521/XEPDB1
JWT_SECRET=your_very_long_random_secret_key_here
JWT_EXPIRES_IN=8h
PORT=5000
NODE_ENV=production
EOF
```

### Install Dependencies & Build

```bash
cd /var/www/dokhr/app

# Install and build backend
cd server
npm ci --production=false
npm run build

# Install and build frontend
cd ../client
npm ci
npm run build

# Copy frontend build to server's public directory
cp -r dist/ ../server/public/
```

### Create PM2 Ecosystem File

```bash
cat > /var/www/dokhr/app/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'dokhr-api',
      script: './server/dist/app.js',
      cwd: '/var/www/dokhr/app',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: '/var/log/dokhr/error.log',
      out_file: '/var/log/dokhr/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '512M',
      restart_delay: 3000,
      watch: false,
    }
  ]
};
EOF
```

### Create Log Directory

```bash
sudo mkdir -p /var/log/dokhr
sudo chown -R dokhr:dokhr /var/log/dokhr
```

### Start with PM2

```bash
cd /var/www/dokhr/app
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # Follow the printed command to enable auto-start on reboot
```

---

## 7. Nginx Configuration

### Create Site Config

```bash
sudo nano /etc/nginx/sites-available/dokhr
```

Paste the following:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/xml+rss text/javascript image/svg+xml;

    # Frontend static files
    root /var/www/dokhr/app/server/public;
    index index.html;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # API proxy to Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # React SPA — serve index.html for all non-API routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

### Enable and Test

```bash
sudo ln -s /etc/nginx/sites-available/dokhr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. PM2 Process Management

### Common Commands

```bash
# View status
pm2 status

# View logs
pm2 logs dokhr-api
pm2 logs dokhr-api --lines 100

# Restart
pm2 restart dokhr-api

# Reload (zero-downtime in cluster mode)
pm2 reload dokhr-api

# Stop
pm2 stop dokhr-api

# Delete from PM2
pm2 delete dokhr-api

# Monitor CPU/RAM in real time
pm2 monit
```

### Zero-Downtime Deployment

```bash
# After building new code:
pm2 reload dokhr-api
```

---

## 9. Jenkins Installation & Setup

### Install Java (Jenkins requirement)

```bash
sudo apt install -y openjdk-17-jdk
java -version
```

### Install Jenkins

```bash
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | \
  sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null

echo deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/ | \
  sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null

sudo apt update
sudo apt install -y jenkins
sudo systemctl enable jenkins
sudo systemctl start jenkins
```

### Get Initial Admin Password

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

### Access Jenkins UI

Open `http://your-server-ip:8080` in your browser and complete the setup wizard.

### Required Jenkins Plugins

Install these via **Manage Jenkins → Plugins → Available plugins**:

- **NodeJS Plugin** — enables Node.js tool in pipelines
- **Git Plugin** — (usually pre-installed)
- **GitHub Plugin** — GitHub integration
- **Pipeline** — (usually pre-installed)
- **Blue Ocean** — (optional, better UI)
- **Credentials Binding Plugin** — secure secret injection
- **SSH Agent Plugin** — for SSH deployments (if needed)

### Configure NodeJS Tool

1. Go to **Manage Jenkins → Tools**
2. Under **NodeJS installations**, click **Add NodeJS**
3. Name: `NodeJS-20`
4. Version: `NodeJS 20.x.x`
5. Save

### Add Credentials

1. Go to **Manage Jenkins → Credentials → System → Global credentials**
2. Add the following:

**GitHub Token:**
- Kind: `Secret text`
- ID: `github-token`
- Secret: Your GitHub personal access token (with `repo` scope)

**Server .env File:**
- Kind: `Secret file`
- ID: `dokhr-env-file`
- File: Upload your `server/.env` file

**Or individual secrets:**
- Kind: `Secret text`
- IDs: `DOKHR_DB_USER`, `DOKHR_DB_PASSWORD`, `DOKHR_DB_CONNECT_STRING`, `DOKHR_JWT_SECRET`

### Allow Jenkins to Deploy

```bash
# Add jenkins user to dokhr group (or give it access to deploy directory)
sudo usermod -aG dokhr jenkins

# Allow jenkins to run pm2 as dokhr user without password
sudo visudo
# Add this line:
jenkins ALL=(dokhr) NOPASSWD: /usr/bin/pm2
```

---

## 10. GitHub Repository & Webhooks

### Push Your Code to GitHub

```bash
cd /path/to/local/DOK-HR
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-org>/DOK-HR.git
git push -u origin main
```

### Create `.gitignore`

```gitignore
# Dependencies
node_modules/

# Build outputs
server/dist/
client/dist/
server/public/

# Environment files
.env
.env.local
.env.production
*.env

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
```

### Configure GitHub Webhook

1. Go to your GitHub repo → **Settings → Webhooks → Add webhook**
2. Set:
   - **Payload URL**: `http://your-server-ip:8080/github-webhook/`
   - **Content type**: `application/json`
   - **Secret**: (optional, but recommended)
   - **Events**: `Just the push event`
3. Click **Add webhook**

### Create Jenkins Pipeline Job

1. **New Item** → Enter name `DOK-HR-Deploy` → Select **Pipeline** → OK
2. Under **Build Triggers**: check **GitHub hook trigger for GITScm polling**
3. Under **Pipeline**:
   - Definition: **Pipeline script from SCM**
   - SCM: **Git**
   - Repository URL: `https://github.com/<your-org>/DOK-HR.git`
   - Credentials: Select your `github-token` credential
   - Branch: `*/main`
   - Script Path: `Jenkinsfile`
4. Save

---

## 11. Jenkins Pipeline (Jenkinsfile)

Create `Jenkinsfile` in your project root:

```groovy
pipeline {
    agent any

    tools {
        nodejs 'NodeJS-20'
    }

    environment {
        APP_DIR     = '/var/www/dokhr/app'
        DEPLOY_USER = 'dokhr'
        PM2_APP     = 'dokhr-api'
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Checking out source code...'
                checkout scm
            }
        }

        stage('Install Server Dependencies') {
            steps {
                dir('server') {
                    echo 'Installing backend dependencies...'
                    sh 'npm ci'
                }
            }
        }

        stage('Install Client Dependencies') {
            steps {
                dir('client') {
                    echo 'Installing frontend dependencies...'
                    sh 'npm ci'
                }
            }
        }

        stage('Build Backend') {
            steps {
                dir('server') {
                    echo 'Compiling TypeScript backend...'
                    sh 'npm run build'
                }
            }
        }

        stage('Build Frontend') {
            steps {
                dir('client') {
                    echo 'Building React frontend...'
                    sh 'npm run build'
                }
            }
        }

        stage('Run Tests') {
            steps {
                echo 'Running tests...'
                // Uncomment when tests are added:
                // dir('server') { sh 'npm test' }
                // dir('client') { sh 'npm test -- --watchAll=false' }
                echo 'Tests skipped (not yet configured)'
            }
        }

        stage('Deploy to Server') {
            steps {
                withCredentials([file(credentialsId: 'dokhr-env-file', variable: 'ENV_FILE')]) {
                    sh """
                        echo '=== Deploying application ==='

                        # Sync source files to app directory
                        rsync -av --delete \
                          --exclude 'node_modules' \
                          --exclude '.git' \
                          --exclude 'server/.env' \
                          ./ ${APP_DIR}/

                        # Copy environment file
                        cp \$ENV_FILE ${APP_DIR}/server/.env

                        # Install production dependencies
                        cd ${APP_DIR}/server && npm ci --omit=dev

                        # Copy frontend build to server public folder
                        rm -rf ${APP_DIR}/server/public
                        cp -r ${APP_DIR}/client/dist ${APP_DIR}/server/public

                        # Set correct ownership
                        chown -R ${DEPLOY_USER}:${DEPLOY_USER} ${APP_DIR}

                        echo '=== Reloading PM2 application ==='
                        su -c 'pm2 reload ${PM2_APP} --update-env' ${DEPLOY_USER}

                        echo '=== Deployment complete ==='
                    """
                }
            }
        }
    }

    post {
        success {
            echo 'Deployment successful!'
            // Optional: send Slack/email notification
        }
        failure {
            echo 'Deployment FAILED. Check the logs above.'
            // Optional: send failure alert
        }
        always {
            cleanWs()
        }
    }
}
```

> **Note**: If Jenkins runs as a different user than `dokhr`, you may need to adjust `rsync` and `su` commands or use SSH-based deployment. See the alternative SSH deployment approach below.

### Alternative: SSH-Based Deployment Stage

If Jenkins is on a separate machine or you prefer SSH:

```groovy
stage('Deploy via SSH') {
    steps {
        sshagent(['dokhr-ssh-key']) {
            sh """
                ssh -o StrictHostKeyChecking=no ${DEPLOY_USER}@${SERVER_IP} '
                    cd ${APP_DIR} && \
                    git pull origin main && \
                    cd server && npm ci --omit=dev && npm run build && \
                    cd ../client && npm ci && npm run build && \
                    cp -r dist/ ../server/public/ && \
                    pm2 reload ${PM2_APP} --update-env
                '
            """
        }
    }
}
```

---

## 12. SSL / HTTPS with Let's Encrypt

### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Obtain Certificate

```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot will automatically update your Nginx config with SSL settings.

### Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot installs a cron/systemd timer automatically
# Verify it exists:
sudo systemctl status certbot.timer
```

### Updated Nginx Config After SSL

Certbot modifies your config automatically, but the final result looks like:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # ... rest of config
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$host$request_uri;
}
```

---

## 13. Firewall & Security

### UFW Firewall Rules

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow ssh          # Port 22
sudo ufw allow 80/tcp       # HTTP
sudo ufw allow 443/tcp      # HTTPS
sudo ufw allow 8080/tcp     # Jenkins UI (restrict to your IP if possible)

# Optional: Allow Oracle DB port only from app server
sudo ufw allow from <app-server-ip> to any port 1521

sudo ufw enable
sudo ufw status
```

### Restrict Jenkins to Your IP

```bash
# Only allow your office/home IP to access Jenkins
sudo ufw allow from <your-ip> to any port 8080
sudo ufw delete allow 8080/tcp  # Remove the open rule
```

### Secure Jenkins Behind Nginx (Recommended)

Add a Jenkins proxy block in Nginx so Jenkins is accessible via `/jenkins` path or a subdomain instead of port 8080:

```nginx
server {
    listen 443 ssl;
    server_name jenkins.your-domain.com;

    # SSL config here...

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then close port 8080 in UFW.

---

## 14. Monitoring & Logs

### Application Logs

```bash
# PM2 real-time logs
pm2 logs dokhr-api

# Tail last 200 lines
pm2 logs dokhr-api --lines 200

# Log files location
tail -f /var/log/dokhr/out.log
tail -f /var/log/dokhr/error.log
```

### Nginx Logs

```bash
# Access log
sudo tail -f /var/log/nginx/access.log

# Error log
sudo tail -f /var/log/nginx/error.log
```

### Jenkins Logs

```bash
sudo journalctl -u jenkins -f
sudo tail -f /var/log/jenkins/jenkins.log
```

### System Resources

```bash
# PM2 dashboard
pm2 monit

# System overview
htop

# Disk usage
df -h

# Memory
free -h
```

### Log Rotation

PM2 log rotation:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true
```

---

## 15. Rollback Procedure

### Quick Rollback via Git

```bash
# On the server, as dokhr user
cd /var/www/dokhr/app

# Check recent commits
git log --oneline -10

# Rollback to a specific commit
git checkout <commit-hash>

# Rebuild
cd server && npm ci --omit=dev && npm run build
cd ../client && npm ci && npm run build
cp -r dist/ ../server/public/

# Restart
pm2 reload dokhr-api
```

### Rollback via Jenkins

1. Open Jenkins → **DOK-HR-Deploy** → **Build History**
2. Find the last successful build
3. Click **Replay** to re-run that build's pipeline with its original code

### Keep Previous Build Artifacts

Modify the Jenkinsfile to keep versioned backups:

```groovy
stage('Backup Current Build') {
    steps {
        sh """
            TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
            cp -r ${APP_DIR}/server/dist ${APP_DIR}/backups/dist_\$TIMESTAMP || true
        """
    }
}
```

---

## 16. Troubleshooting

### Backend won't start — OracleDB error

```bash
# Check LD_LIBRARY_PATH
echo $LD_LIBRARY_PATH
# Should include /opt/oracle/instantclient_21_x

# Add to /etc/environment
sudo nano /etc/environment
# Add: LD_LIBRARY_PATH=/opt/oracle/instantclient_21_x

# Reload env for PM2
pm2 restart dokhr-api --update-env
```

### 502 Bad Gateway from Nginx

```bash
# Check if Node.js process is running
pm2 status
pm2 logs dokhr-api --lines 50

# Check the port
ss -tlnp | grep 5000

# Restart application
pm2 restart dokhr-api
```

### Jenkins build fails — npm not found

```bash
# In Jenkins → Manage Jenkins → Tools → NodeJS
# Make sure the NodeJS tool name exactly matches what's in the Jenkinsfile
# tools { nodejs 'NodeJS-20' }
```

### Database connection refused

```bash
# Test connectivity
telnet <db-host> 1521

# Check Oracle listener status (on DB server)
lsnrctl status

# Verify .env file has correct values
cat /var/www/dokhr/app/server/.env
```

### Nginx config test fails

```bash
sudo nginx -t
# Shows exact error and line number

# Common issues:
# - Missing semicolon
# - Duplicate server_name
# - Wrong file path
```

### PM2 app not persisting after reboot

```bash
pm2 save
pm2 startup
# Copy and run the command PM2 prints
```

### CORS errors in browser

Ensure the backend CORS configuration in `server/src/app.ts` includes your production domain:

```typescript
app.use(cors({
    origin: ['https://your-domain.com', 'http://localhost:5173'],
    credentials: true,
}));
```

### Frontend shows blank page after deploy

```bash
# Check if index.html exists in server/public
ls /var/www/dokhr/app/server/public/

# Check Nginx root path
grep -n 'root' /etc/nginx/sites-available/dokhr

# Confirm the React build was copied correctly
ls /var/www/dokhr/app/server/public/assets/
```

---

## Quick Reference Cheatsheet

```bash
# Deploy manually
cd /var/www/dokhr/app
git pull origin main
cd server && npm ci --omit=dev && npm run build
cd ../client && npm ci && npm run build
cp -r dist/ ../server/public/
pm2 reload dokhr-api

# Check app health
pm2 status
pm2 logs dokhr-api --lines 30
curl http://localhost:5000/api/health

# Check Nginx
sudo nginx -t && sudo systemctl reload nginx

# Check Jenkins
sudo systemctl status jenkins

# View all logs
pm2 logs
```

---

*Generated for DOK-HR v1.0 — DOK Systems HR Platform*
