# CI/CD Guide — DOK-HR with Jenkins + GitHub on Linux

This guide sets up an automated pipeline:
**Push to `main` branch → GitHub webhook → Jenkins → Build → Deploy → PM2 reload**

---

## Architecture Overview

```
Developer (Local)
      │  git push origin main
      ▼
  GitHub Repo
      │  webhook (POST)
      ▼
  Jenkins (port 8080)
      │  1. git pull
      │  2. npm install (server + client)
      │  3. npm run build (client)
      │  4. pm2 reload dok-hr-api
      ▼
  DOK-HR Live (port 8082 via Nginx)
```

---

## Part 1 — Install Jenkins on Linux

### 1.1 Install Java (Jenkins requires JDK 11 or 17)

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk
java -version
```

### 1.2 Add Jenkins Repository and Install

```bash
# Add Jenkins GPG key and repo
curl -fsSL https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key | \
  sudo tee /usr/share/keyrings/jenkins-keyring.asc > /dev/null

echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" | \
  sudo tee /etc/apt/sources.list.d/jenkins.list > /dev/null

sudo apt update
sudo apt install -y jenkins
```

### 1.3 Start Jenkins

```bash
sudo systemctl enable jenkins
sudo systemctl start jenkins
sudo systemctl status jenkins
```

### 1.4 Get Initial Admin Password

```bash
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

### 1.5 Open Jenkins in Browser

```
http://YOUR_SERVER_IP:8080
```

- Paste the initial admin password
- Click **Install suggested plugins**
- Create your admin user
- Save and finish

---

## Part 2 — Configure Jenkins

### 2.1 Install Required Plugins

Go to **Manage Jenkins → Plugins → Available plugins**, install:

- **GitHub Integration Plugin**
- **NodeJS Plugin**
- **Pipeline**
- **Git plugin** (usually pre-installed)
- **SSH Agent Plugin** (if deploying to a separate server)

Click **Install** and restart Jenkins.

### 2.2 Configure NodeJS in Jenkins

Go to **Manage Jenkins → Tools → NodeJS installations**:

- Click **Add NodeJS**
- Name: `NodeJS-20`
- Version: `20.x` (latest LTS)
- Click **Save**

### 2.3 Add GitHub Credentials

Go to **Manage Jenkins → Credentials → System → Global credentials → Add Credentials**:

- Kind: `Username with password`
- Username: your GitHub username
- Password: your GitHub **Personal Access Token** (PAT)
  - Generate at GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  - Scopes needed: `repo`, `admin:repo_hook`
- ID: `github-credentials`
- Click **Save**

---

## Part 3 — Set Up GitHub Repository

### 3.1 Create GitHub Repository (if not done)

```bash
# On your local machine
cd d:/Project/DOK-HR
git remote add origin https://github.com/YOUR_USERNAME/DOK-HR.git
git push -u origin main
git push -u origin dev
```

### 3.2 Create .gitignore (if not exists)

Make sure these are excluded:

```gitignore
# Dependencies
node_modules/
client/node_modules/
server/node_modules/

# Build output
client/dist/

# Environment files (NEVER commit these)
.env
server/.env
client/.env

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db

# ZIP files
*.zip
```

### 3.3 Add GitHub Webhook

Go to your GitHub repo → **Settings → Webhooks → Add webhook**:

- Payload URL: `http://YOUR_SERVER_IP:8080/github-webhook/`
- Content type: `application/json`
- Secret: leave blank (or set one — see section 3.4)
- Which events: **Just the push event**
- Active: ✓ checked
- Click **Add webhook**

> **Note:** Jenkins must be accessible from the internet for webhooks to work.
> If your server is behind a firewall, open port 8080 or use a reverse proxy.

### 3.4 (Optional) Secure Webhook with Secret

In Jenkins job → **Build Triggers → GitHub hook trigger** → Advanced → add a secret token.
Add the same secret to the GitHub webhook Secret field.

---

## Part 4 — Create Jenkinsfile in Project

Create this file at the project root `d:/Project/DOK-HR/Jenkinsfile`:

```groovy
pipeline {
    agent any

    tools {
        nodejs 'NodeJS-20'
    }

    environment {
        APP_DIR    = '/home/dokHr/DOK-HR'
        SERVER_DIR = '/home/dokHr/DOK-HR/server'
        CLIENT_DIR = '/home/dokHr/DOK-HR/client'
        PM2_APP    = 'dok-hr-api'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Pulling latest code from GitHub...'
                git branch: 'main',
                    credentialsId: 'github-credentials',
                    url: 'https://github.com/YOUR_USERNAME/DOK-HR.git'
            }
        }

        stage('Install Server Dependencies') {
            steps {
                echo 'Installing server dependencies...'
                dir('server') {
                    sh 'npm install'
                }
            }
        }

        stage('Install Client Dependencies') {
            steps {
                echo 'Installing client dependencies...'
                dir('client') {
                    sh 'npm install'
                }
            }
        }

        stage('Build Frontend') {
            steps {
                echo 'Building React frontend...'
                dir('client') {
                    sh 'npm run build'
                }
            }
        }

        stage('Deploy to Server') {
            steps {
                echo 'Copying built files to deployment directory...'
                sh '''
                    # Copy server files
                    rsync -av --exclude='node_modules' --exclude='.env' \
                        server/ ${SERVER_DIR}/

                    # Copy built client
                    rsync -av client/dist/ ${CLIENT_DIR}/dist/

                    # Install server production dependencies on deploy path
                    cd ${SERVER_DIR} && npm install --omit=dev
                '''
            }
        }

        stage('Reload Application') {
            steps {
                echo 'Reloading PM2 application...'
                sh '''
                    export PATH="$PATH:/usr/local/bin"
                    pm2 reload ${PM2_APP} --update-env || pm2 start ${SERVER_DIR}/ecosystem.config.js
                    pm2 save
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Checking application health...'
                sh '''
                    sleep 5
                    curl -f http://localhost:5001/health || exit 1
                    echo "Health check passed!"
                '''
            }
        }
    }

    post {
        success {
            echo '✅ Deployment successful! DOK-HR is live.'
        }
        failure {
            echo '❌ Deployment failed. Check the logs above.'
        }
    }
}
```

Commit and push this file:

```bash
git add Jenkinsfile
git commit -m "ci: add Jenkins pipeline"
git push origin main
```

---

## Part 5 — Create Jenkins Pipeline Job

### 5.1 Create New Job

In Jenkins dashboard → **New Item**:

- Name: `DOK-HR`
- Type: **Pipeline**
- Click **OK**

### 5.2 Configure the Job

**General:**
- ✓ GitHub project
- Project URL: `https://github.com/YOUR_USERNAME/DOK-HR/`

**Build Triggers:**
- ✓ **GitHub hook trigger for GITScm polling**

**Pipeline:**
- Definition: `Pipeline script from SCM`
- SCM: `Git`
- Repository URL: `https://github.com/YOUR_USERNAME/DOK-HR.git`
- Credentials: select `github-credentials`
- Branch: `*/main`
- Script Path: `Jenkinsfile`

Click **Save**.

---

## Part 6 — Jenkins User Permissions for PM2 & Files

Jenkins runs as the `jenkins` user by default. It needs permission to manage PM2 and write to the deployment directory.

### 6.1 Add Jenkins User to Deploy Group

```bash
# Add jenkins user to the dokHr group (or vice versa)
sudo usermod -aG dokHr jenkins

# Give jenkins ownership or write access to the deploy dir
sudo chown -R jenkins:jenkins /home/dokHr/DOK-HR
# OR use ACL:
sudo apt install -y acl
sudo setfacl -R -m u:jenkins:rwx /home/dokHr/DOK-HR
```

### 6.2 Allow Jenkins to Run PM2

PM2 is installed globally. Check its path:

```bash
which pm2
# e.g. /usr/local/bin/pm2 or /home/dokHr/.nvm/versions/node/v20.x.x/bin/pm2
```

If PM2 was installed under `dokHr` user's NVM, the Jenkins user can't access it directly.
Fix by installing PM2 globally as root:

```bash
sudo npm install -g pm2
sudo ln -s $(which pm2) /usr/local/bin/pm2
```

### 6.3 Allow Jenkins sudo for PM2 (if needed)

```bash
sudo visudo
```

Add this line:

```
jenkins ALL=(ALL) NOPASSWD: /usr/local/bin/pm2
```

---

## Part 7 — Configure .env on Server

The `.env` file is never committed to GitHub. Set it up once on the server:

```bash
nano /home/dokHr/DOK-HR/server/.env
```

```env
NODE_ENV=production
PORT=5001
DB_USER=your_oracle_user
DB_PASSWORD=your_oracle_password
DB_CONNECTION_STRING=localhost:1521/XEPDB1
JWT_SECRET=your_very_long_random_secret_key
DAYS_IN_PERIOD=22
EXTRA_UNIT_RATE=0.5
ORACLE_HOME=/opt/oracle/product/21c/dbhomeXE
LD_LIBRARY_PATH=/opt/oracle/product/21c/dbhomeXE/lib
```

This file stays on the server and is never touched by the pipeline.

---

## Part 8 — ecosystem.config.js on Server

Make sure `/home/dokHr/DOK-HR/server/ecosystem.config.js` exists:

```javascript
module.exports = {
  apps: [{
    name: 'dok-hr-api',
    script: 'src/server.ts',
    interpreter: 'node',
    interpreter_args: '-r ts-node/register',
    cwd: '/home/dokHr/DOK-HR/server',
    env: {
      NODE_ENV: 'production',
      LD_LIBRARY_PATH: '/opt/oracle/product/21c/dbhomeXE/lib',
      ORACLE_HOME: '/opt/oracle/product/21c/dbhomeXE'
    },
    error_file: '/var/log/dok-hr/error.log',
    out_file: '/var/log/dok-hr/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

Create log directory:

```bash
sudo mkdir -p /var/log/dok-hr
sudo chown jenkins:jenkins /var/log/dok-hr
```

---

## Part 9 — Nginx Configuration (Reference)

`/etc/nginx/sites-available/dok-hr`:

```nginx
server {
    listen 8082;
    server_name _;

    root /home/dokHr/DOK-HR/client/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Swagger docs
    location /api-docs {
        proxy_pass http://localhost:5001/api-docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:5001/health;
    }

    # React SPA — all other routes served by index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Part 10 — Test the Full Pipeline

### 10.1 Manual First Run

In Jenkins → `DOK-HR` job → **Build Now**

Watch the Console Output. All stages should go green.

### 10.2 Test Automated Trigger

```bash
# On your local machine
echo "# test" >> README.md
git add README.md
git commit -m "test: trigger Jenkins pipeline"
git push origin main
```

Within seconds Jenkins should automatically start a new build.

### 10.3 Verify Deployment

```bash
# On the server
pm2 status
curl http://localhost:5001/health
curl http://192.168.2.199:8082/health
```

Expected response: `{"status":"ok","timestamp":"..."}`

---

## Part 11 — Branch Strategy (dev → main)

For a safe workflow:

| Branch | Purpose | Auto Deploy? |
|--------|---------|-------------|
| `dev` | Active development | No |
| `main` | Production | Yes (Jenkins) |

### Workflow

```bash
# Work on dev
git checkout dev
git add .
git commit -m "feat: new feature"
git push origin dev

# When ready to deploy — merge to main
git checkout main
git merge dev
git push origin main
# ↑ This triggers Jenkins automatically
```

### Add a dev Pipeline (Optional)

Duplicate the Jenkins job as `DOK-HR-dev`, change branch to `*/dev`, and deploy to a staging port (e.g., 5002 / Nginx 8083).

---

## Part 12 — Useful Jenkins & Server Commands

```bash
# --- Jenkins ---
sudo systemctl start jenkins
sudo systemctl stop jenkins
sudo systemctl restart jenkins
sudo systemctl status jenkins
sudo tail -f /var/log/jenkins/jenkins.log

# --- PM2 ---
pm2 status                        # List all apps
pm2 logs dok-hr-api               # Live logs
pm2 logs dok-hr-api --lines 100   # Last 100 lines
pm2 reload dok-hr-api             # Zero-downtime reload
pm2 restart dok-hr-api            # Full restart
pm2 stop dok-hr-api               # Stop app

# --- Nginx ---
sudo nginx -t                     # Test config
sudo systemctl reload nginx       # Apply config changes
sudo tail -f /var/log/nginx/error.log

# --- Check what is on a port ---
sudo ss -tlnp | grep 5001
sudo ss -tlnp | grep 8082
```

---

## Part 13 — Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Webhook not triggering | Jenkins not reachable from internet | Open port 8080 in firewall, or use ngrok for testing |
| `pm2: command not found` in pipeline | PM2 path not in Jenkins PATH | Add full path `/usr/local/bin/pm2` or fix PATH in Jenkinsfile |
| Permission denied on deploy dir | Jenkins user has no write access | `sudo chown -R jenkins /home/dokHr/DOK-HR` |
| `npm run build` fails | Wrong Node version | Check `node -v` in pipeline; ensure NodeJS tool is configured |
| Health check fails after deploy | App takes >5s to start | Increase `sleep 5` to `sleep 10` in pipeline |
| ORA-12541 after deploy | `.env` missing or wrong DB config | Check `.env` exists on server with correct credentials |

---

## Summary — Full Flow

```
1. Developer pushes code to main branch on GitHub
2. GitHub sends webhook to Jenkins (port 8080)
3. Jenkins pipeline starts automatically:
   a. Pulls latest code from GitHub
   b. Installs dependencies (server + client)
   c. Builds React frontend (npm run build)
   d. Copies files to /home/dokHr/DOK-HR/
   e. Reloads PM2 (zero-downtime)
   f. Runs health check on :5001/health
4. If all passes → deployment complete
5. Users access DOK-HR at http://SERVER_IP:8082
```
