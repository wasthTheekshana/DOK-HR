# HR Web Application

A complete enterprise HR web application for managing Sites, Staff, Tasks, and Payroll with Oracle Database integration.

## Features

- **Role-Based Access Control**: Admin, Supervisor, Staff roles.
- **Site & User Management**: Full CRUD for sites and staff.
- **Task Management**: Track daily tasks with Invoice Price, Unit Price, and Counts.
- **Payroll Calculation**:
  - **Time-based**: Calculates extra hours (rounded half-up) * Pay Unit Price.
  - **Target-based**: Calculates (Sum Count - Target*22) * Extra Rate used.
- **Reporting**: Dashboard metrics and report views.
- **Attendance**: Track In/Out times.

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, TailwindCSS
- **Backend**: Node.js, Express, TypeScript, OracleDB (node-oracledb)
- **Database**: Oracle Database (Tested with Oracle XE)

## Prerequisites

- Node.js (v18+)
- Oracle Database (XE or Enterprise) running locally or containerized.
- Docker (optional, for running Oracle XE)

## Setup Instructions

### 1. Database Setup
Ensure you have an Oracle Database running. If using Docker:
```bash
docker run -d --name oracle-xe \
  -p 1521:1521 -p 8080:8080 \
  -e ORACLE_PWD=password123 \
  container-registry.oracle.com/database/express:latest
```

### 2. Backend Setup
1. Navigate to `/server`:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment:
   - Copy `.env.example` to `.env`.
   - Update `DB_CONNECT_STRING`, `DB_USER`, `DB_PASSWORD`.
   ```env
   DB_USER=system
   DB_PASSWORD=password123
   DB_CONNECT_STRING=localhost:1521/XE
   ```
4. Seed Database (Creates Schema & Sample Data):
   ```bash
   npm run seed
   ```
5. Run Tests:
   ```bash
   npm test
   ```
6. Start Server:
   ```bash
   npm run dev
   ```

### 3. Frontend Setup
1. Navigate to `/client`:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Dev Server:
   ```bash
   npm run dev
   ```

## Usage

1. **Login Credentials** (Created by seed script):
   - **Admin**: `ADMIN001` / `password123`
   - **Supervisor**: `SUP001` / `password123`
   - **Staff**: `EMP001` / `password123`

2. **Dashboard**: View system overview.
3. **Sites/Users**: Manage resources (Admin only).
4. **Tasks**: Add daily tasks. Edit rows inline and click save icon.
5. **Payroll**: Go to Payroll page, select Site and Date Range, click Calculate to see payments.

## API Documentation

The API runs at `http://localhost:5000/api`. Key endpoints:
- `POST /auth/login`
- `GET /users`, `POST /users`
- `GET /sites`, `POST /sites`
- `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`
- `GET /payroll`
