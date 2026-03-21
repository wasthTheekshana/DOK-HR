# DOK-HR Deployment Guide

> Linux server deployment alongside an existing project on port 8081.

---

## Architecture Overview

```
Internet
    │
    ▼
 Nginx (80/443)
    ├── :8081  →  Existing project  (untouched)
    └── :8082  →  DOK-HR
                    ├── /          React frontend (static build)
                    ├── /api/      Express backend (internal :5000)
                    └── /api-docs  Swagger UI
```

---

## Part 1 — Server Setup

### Step 1 — Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version    # v20.x.x
npm --version
```

### Step 2 — Install Oracle Instant Client

Required by the `oracledb` npm package.

```bash
sudo apt-get install -y libaio1

# Create directory and upload your Instant Client zip files
# Download from: https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html
sudo mkdir -p /opt/oracle
cd /opt/oracle

sudo unzip instantclient-basic-linux.x64-21.x.zip
sudo unzip instantclient-sdk-linux.x64-21.x.zip

# Register library path
echo /opt/oracle/instantclient_21_x | sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf
sudo ldconfig

# Set environment variables (add to /etc/environment for persistence)
export LD_LIBRARY_PATH=/opt/oracle/instantclient_21_x:$LD_LIBRARY_PATH
export ORACLE_HOME=/opt/oracle/instantclient_21_x
```

### Step 3 — Install PM2

```bash
sudo npm install -g pm2
```

### Step 4 — Install Nginx

```bash
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Part 2 — Deploy the Project

### Step 5 — Clone / Upload Project

```bash
# Option A: Git clone
cd /var/www
sudo git clone https://github.com/yourrepo/DOK-HR.git
sudo chown -R $USER:$USER /var/www/DOK-HR

# Option B: SCP from Windows (run in PowerShell)
# scp -r "d:\Project\DOK-HR" user@server-ip:/var/www/DOK-HR
```

### Step 6 — Configure Environment Variables

```bash
cd /var/www/DOK-HR/server
cp .env.example .env
nano .env
```

Set your production values:

```env
PORT=5000
DB_USER=your_oracle_user
DB_PASSWORD=your_oracle_password
DB_CONNECT_STRING=your-oracle-host:1521/XEPDB1
JWT_SECRET=change_this_to_a_long_random_secret_key
DAYS_IN_PERIOD=22
EXTRA_UNIT_RATE=0.5
```

> Never commit `.env` to git.

### Step 7 — Install Server Dependencies

```bash
cd /var/www/DOK-HR/server
npm install

# Quick test (Ctrl+C after confirming it starts)
npm start
```

### Step 8 — Build Frontend

Update the API base URL in the client to point to the server before building:

```bash
# Find where baseURL is set
grep -r "baseURL\|localhost:5000" /var/www/DOK-HR/client/src --include="*.ts" --include="*.tsx"
```

Update to:
```typescript
baseURL: 'http://your-server-ip:8082/api'
```

Then build:
```bash
cd /var/www/DOK-HR/client
npm install
npm run build
# Output: client/dist/
```

### Step 9 — Start Backend with PM2

```bash
cd /var/www/DOK-HR/server

# Create PM2 config
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'dok-hr-api',
    script: 'src/server.ts',
    interpreter: 'node',
    interpreter_args: '-r ts-node/register',
    cwd: '/var/www/DOK-HR/server',
    env: {
      NODE_ENV: 'production',
      LD_LIBRARY_PATH: '/opt/oracle/instantclient_21_x'
    },
    error_file: '/var/log/dok-hr/error.log',
    out_file: '/var/log/dok-hr/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
EOF

# Create log directory
sudo mkdir -p /var/log/dok-hr
sudo chown $USER:$USER /var/log/dok-hr

# Start
pm2 start ecosystem.config.js

# Auto-start on server reboot
pm2 save
pm2 startup   # Run the sudo command it outputs
```

---

## Part 3 — Nginx Configuration

> Add a new server block for DOK-HR without touching the existing `:8081` config.

### Step 10 — Create Nginx Site Config

```bash
sudo nano /etc/nginx/sites-available/dok-hr
```

Paste:

```nginx
server {
    listen 8082;
    server_name _;

    # Serve React frontend
    root /var/www/DOK-HR/client/dist;
    index index.html;

    # React Router — serve index.html for all frontend routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to Express backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Swagger UI
    location /api-docs {
        proxy_pass http://localhost:5000/api-docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:5000/health;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/dok-hr /etc/nginx/sites-enabled/

# Test config — must say "syntax is ok"
sudo nginx -t

# Reload without downtime (existing :8081 project stays live)
sudo systemctl reload nginx
```

### Step 11 — Open Firewall Port

```bash
sudo ufw allow 8082
sudo ufw status
```

> If using a cloud provider (AWS/GCP/Azure/DigitalOcean), also open port `8082` in the security group / firewall dashboard.

---

## Part 4 — Verify

```bash
# PM2 process status
pm2 status
pm2 logs dok-hr-api --lines 30

# Backend directly
curl http://localhost:5000/health

# Through Nginx
curl http://192.168.2.199:8082/health

# Test login
curl http://your-server-ip:8082/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"ADMIN001","password":"yourpassword"}'
```

**Access URLs:**

| URL | Description |
|-----|-------------|
| `http://serverip:8081` | Existing project (unchanged) |
| `http://serverip:8082` | DOK-HR React frontend |
| `http://serverip:8082/api-docs` | Swagger API documentation |
| `http://serverip:8082/api/...` | DOK-HR API endpoints |
| `http://serverip:8082/health` | Health check |

---

## Part 5 — Optional: HTTPS with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certificates auto-renew every 90 days.

---

## Updating the App

```bash
cd /var/www/DOK-HR
git pull origin main

# If client files changed — rebuild frontend
cd client && npm run build

# If server files changed — restart backend
cd ../server
npm install        # only if package.json changed
pm2 restart dok-hr-api

# Check logs after restart
pm2 logs dok-hr-api --lines 50
```

---

---

# Database Table Setup

## Tables Created

| Table | Purpose |
|-------|---------|
| `users` | Staff, supervisors, admins |
| `sites` | Work sites |
| `site_task_types` | Task types and invoice prices per site |
| `tasks` | Daily task and attendance records |
| `attendance` | Separate attendance records |
| `custom_ot_records` | Saved custom OT calculation history |
| `payroll_saved_records` | Saved payroll calculation history |
| `cost_varient` | Site cost factors (salary, transport, etc.) |
| `profit_amount` | Monthly invoice and profit records |

---

## Option A — Seed Script (Test Environment)

Drops existing tables, recreates all tables, and inserts sample data.

```bash
cd /var/www/DOK-HR/server

# Verify .env DB connection is correct
cat .env

# Run seed
npm run seed
```

**Sample accounts created (all use password `password123`):**

| EPF Number | Name | Role |
|------------|------|------|
| `ADMIN001` | System Admin | admin |
| `SUP001` | John Supervisor | supervisor |
| `EMP001` | Jane Worker | staff |
| `EMP002` | Bob Builder | staff |

> **Warning:** `npm run seed` drops and recreates tables. Never run on a server with real data.

---

## Option B — Run schema.sql Directly (Production / Clean Setup)

Creates all tables without inserting any sample data.

### Connect via SQL*Plus and run the schema

```bash
sqlplus your_db_user/your_db_password@localhost:1521/XEPDB1 \
  @/var/www/DOK-HR/server/src/db/schema.sql
```

Or interactively:

```bash
sqlplus your_db_user/your_db_password@localhost:1521/XEPDB1

SQL> @/var/www/DOK-HR/server/src/db/schema.sql
SQL> EXIT;
```

### Create First Admin User (After Option B)

Generate a bcrypt password hash:

```bash
cd /var/www/DOK-HR/server
node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('your_admin_password', 10).then(h => console.log(h));
"
```

Copy the hash output and insert into Oracle:

```sql
INSERT INTO users (epf_number, name, password, role, status)
VALUES ('ADMIN001', 'System Admin', 'PASTE_HASH_HERE', 'admin', 'active');
COMMIT;
```

---

## Option C — Existing Database (Add Missing Tables/Columns Only)

If the database already has some tables and you only need to add new columns or tables, run only the ALTER scripts from the bottom of `schema.sql`:

```sql
-- Add salary columns to users (if missing)
ALTER TABLE users ADD basic_salary  NUMBER(12,2) DEFAULT 0;
ALTER TABLE users ADD ot_percentage NUMBER(6,2)  DEFAULT 0;
ALTER TABLE users ADD fix_salary    NUMBER(12,2) DEFAULT 0;

-- Add site type columns (if missing)
ALTER TABLE sites ADD service_type VARCHAR2(50);
ALTER TABLE sites ADD site_type    VARCHAR2(50);

-- Create new tables if they don't exist yet
-- (copy individual CREATE TABLE blocks from schema.sql)
```

---

## Quick Decision Guide

| Scenario | Use |
|----------|-----|
| Fresh test server, want sample data | Option A — `npm run seed` |
| Fresh production server, no sample data | Option B — `sqlplus @schema.sql` + manual admin insert |
| Server already has data, add missing columns | Option C — `ALTER TABLE` scripts only |
