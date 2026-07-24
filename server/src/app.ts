import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import authRoutes from './routes/authRoutes';
import siteRoutes from './routes/siteRoutes';
import userRoutes from './routes/userRoutes';
import taskRoutes from './routes/taskRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import payrollRoutes from './routes/payrollRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import invoiceRoutes from './routes/invoiceRoutes';
import poyaRoutes from './routes/poyaRoutes';
import assignmentRoutes from './routes/assignmentRoutes';
import projectPlanningRoutes from './routes/projectPlanningRoutes';
import kpiRoutes from './routes/kpiRoutes';
import { globalLimiter, loginLimiter, heavyLimiter } from './middleware/rateLimitMiddleware';

const app = express();

app.use(cors());
app.use(express.json());

// Rate limiting — applied before routes
app.use(globalLimiter);

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Debug logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Auth — login gets a strict brute-force limiter
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);

app.use('/api/sites', siteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/attendance', attendanceRoutes);

// Payroll + analytics + invoices get the heavy-endpoint limiter
app.use('/api/payroll', heavyLimiter, payrollRoutes);
app.use('/api/analytics', heavyLimiter, analyticsRoutes);
app.use('/api/invoices', heavyLimiter, invoiceRoutes);

app.use('/api/poya-days', poyaRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/project-planning', projectPlanningRoutes);
app.use('/api/kpi', kpiRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// 404 handler - must be after all other routes
app.use((req, res) => {
    console.log(`404 - Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ message: 'Route not found', path: req.url });
});

export { app };
