import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="sites" element={<Sites />} />
            <Route path="users" element={<Users />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="reports" element={<Reports />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="site-performance" element={<SitePerformance />} />
            <Route path="time-site-performance" element={<TimeSitePerformance />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="task-summary" element={<TaskSummary />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
