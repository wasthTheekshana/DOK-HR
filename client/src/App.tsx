import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';

import Sites from './pages/Sites';
import Users from './pages/Users';
import Tasks from './pages/Tasks';
import AttendancePage from './pages/Attendance';
import Payroll from './pages/Payroll';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import Dashboard from './pages/Dashboard';
import SitePerformance from './pages/SitePerformance';
import TimeSitePerformance from './pages/TimeSitePerformance';
import Invoices from './pages/Invoices';
import TaskSummary from './pages/TaskSummary';
import InvoiceAnalysis from './pages/InvoiceAnalysis';
import ServiceMindmap from './pages/ServiceMindmap';
import ExtraUnits from './pages/ExtraUnits';
import ProjectPlanning from './pages/ProjectPlanning';
import StaffKpi from './pages/StaffKpi';

const LoadingScreen = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="flex flex-col items-center space-y-4">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-600 font-medium">Loading...</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RoleProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles: string[] }> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isLoading, role } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role && !allowedRoles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const DashboardHome: React.FC = () => {
  const { role } = useAuth();
  if (role === 'hr') return <Navigate to="/sites" replace />;
  return <Dashboard />;
};

const ADMIN_ROLES = ['admin', 'system_admin'];
const MANAGER_ROLES = ['admin', 'system_admin', 'supervisor'];
// Routes project_manager should reach in addition to the sets above — kept separate
// so widening PM's access can't silently leak into analytics/task-summary/invoice-analysis,
// which share ADMIN_ROLES/MANAGER_ROLES today but are explicitly system_admin/admin-only per spec.
const PM_MANAGER_ROLES = [...MANAGER_ROLES, 'project_manager'];
const PM_ADMIN_ROLES = [...ADMIN_ROLES, 'project_manager'];
// hr is read-only on Sites and Team only — kept separate from PM_MANAGER_ROLES so it can't
// leak into payroll/reports/analytics, which share that array today.
const SITE_TEAM_VIEW_ROLES = [...PM_MANAGER_ROLES, 'hr'];

function App() {
  return (
    <Router>
      <Toaster position="top-center" toastOptions={{ duration: 3500, style: { fontWeight: 600 } }} />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<DashboardHome />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="sites" element={<RoleProtectedRoute allowedRoles={SITE_TEAM_VIEW_ROLES}><Sites /></RoleProtectedRoute>} />
            <Route path="users" element={<RoleProtectedRoute allowedRoles={SITE_TEAM_VIEW_ROLES}><Users /></RoleProtectedRoute>} />
            <Route path="payroll" element={<RoleProtectedRoute allowedRoles={ADMIN_ROLES}><Payroll /></RoleProtectedRoute>} />
            <Route path="reports" element={<RoleProtectedRoute allowedRoles={['admin', 'project_manager']}><Reports /></RoleProtectedRoute>} />
            <Route path="analytics" element={<RoleProtectedRoute allowedRoles={MANAGER_ROLES}><Analytics /></RoleProtectedRoute>} />
            <Route path="site-performance" element={<RoleProtectedRoute allowedRoles={MANAGER_ROLES}><SitePerformance /></RoleProtectedRoute>} />
            <Route path="time-site-performance" element={<RoleProtectedRoute allowedRoles={MANAGER_ROLES}><TimeSitePerformance /></RoleProtectedRoute>} />
            <Route path="invoices" element={<RoleProtectedRoute allowedRoles={PM_ADMIN_ROLES}><Invoices /></RoleProtectedRoute>} />
            <Route path="task-summary" element={<RoleProtectedRoute allowedRoles={MANAGER_ROLES}><TaskSummary /></RoleProtectedRoute>} />
            <Route path="invoice-analysis" element={<RoleProtectedRoute allowedRoles={PM_ADMIN_ROLES}><InvoiceAnalysis /></RoleProtectedRoute>} />
            <Route path="service-mindmap" element={<RoleProtectedRoute allowedRoles={['system_admin']}><ServiceMindmap /></RoleProtectedRoute>} />
            <Route path="extra-units" element={<RoleProtectedRoute allowedRoles={ADMIN_ROLES}><ExtraUnits /></RoleProtectedRoute>} />
            <Route path="project-planning" element={<RoleProtectedRoute allowedRoles={['project_manager']}><ProjectPlanning /></RoleProtectedRoute>} />
            <Route path="kpi" element={<RoleProtectedRoute allowedRoles={['project_manager']}><StaffKpi /></RoleProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
