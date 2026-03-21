import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, Users, MapPin, ClipboardList, CalendarCheck,
    FileText, LogOut, Menu, X, ChevronLeft, ChevronRight,
    DollarSign, BarChart3, TrendingUp, Target
} from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
    { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard, roles: ['admin', 'supervisor', 'staff', 'system_admin'], color: 'text-blue-400' },
    { to: '/sites', label: 'Sites', shortLabel: 'Sites', icon: MapPin, roles: ['admin', 'supervisor', 'system_admin'], color: 'text-emerald-400' },
    { to: '/users', label: 'Team', shortLabel: 'Team', icon: Users, roles: ['admin', 'supervisor', 'system_admin'], color: 'text-violet-400' },
    { to: '/tasks', label: 'Tasks', shortLabel: 'Tasks', icon: ClipboardList, roles: ['admin', 'supervisor'], color: 'text-orange-400' },
    { to: '/attendance', label: 'Attendance', shortLabel: 'Attend', icon: CalendarCheck, roles: ['admin', 'supervisor', 'system_admin'], color: 'text-cyan-400' },
    { to: '/payroll', label: 'Payroll', shortLabel: 'Pay', icon: DollarSign, roles: ['admin', 'supervisor', 'staff', 'system_admin'], color: 'text-green-400' },
    { to: '/reports', label: 'Reports', shortLabel: 'Reports', icon: BarChart3, roles: ['admin'], color: 'text-pink-400' },
    { to: '/analytics', label: 'Analytics', shortLabel: 'Stats', icon: TrendingUp, roles: ['system_admin'], color: 'text-indigo-400' },
    { to: '/site-performance', label: 'Site Performance', shortLabel: 'Perf', icon: Target, roles: ['admin', 'system_admin'], color: 'text-rose-400' },
    { to: '/invoices', label: 'Invoices', shortLabel: 'Invoice', icon: FileText, roles: ['admin', 'system_admin'], color: 'text-yellow-400' },
];

const Layout: React.FC = () => {
    const { user, logout, role } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = () => { logout(); navigate('/login'); };
    const filtered = navItems.filter(item => item.roles.includes(role || ''));

    const currentPage = navItems.find(item => {
        if (item.to === '/') return location.pathname === '/';
        return location.pathname.startsWith(item.to);
    });

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden">
            {/* ── Desktop Sidebar ── */}
            <aside className={cn(
                'hidden md:flex flex-col bg-slate-900 border-r border-slate-800 z-30 transition-all duration-300 ease-in-out shrink-0',
                isCollapsed ? 'w-[70px]' : 'w-64'
            )}>
                {/* Logo */}
                <div className={cn(
                    'flex items-center h-16 border-b border-slate-800 shrink-0',
                    isCollapsed ? 'justify-center px-0' : 'px-5'
                )}>
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-md">
                        <span className="text-white font-black text-base">D</span>
                    </div>
                    {!isCollapsed && (
                        <div className="ml-3 overflow-hidden">
                            <p className="text-white font-black text-base leading-none tracking-tight">DOK Systems</p>
                            <p className="text-slate-500 text-[10px] mt-0.5 font-medium">HR Platform</p>
                        </div>
                    )}
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-[70px] w-6 h-6 bg-slate-700 hover:bg-indigo-600 border border-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-all z-40 shadow-lg"
                >
                    {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
                </button>

                {/* Nav */}
                <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto sidebar-scroll">
                    {!isCollapsed && (
                        <p className="px-3 text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-3">Navigation</p>
                    )}
                    {filtered.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === "/"}
                            title={isCollapsed ? item.label : undefined}
                            className={({ isActive }) => cn(
                                'group flex items-center py-2.5 text-sm font-medium rounded-xl transition-all duration-150 relative',
                                isCollapsed ? 'justify-center px-2' : 'px-3',
                                isActive
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                            )}
                        >
                            <item.icon className={cn('w-5 h-5 shrink-0 transition-transform group-hover:scale-110', isCollapsed ? '' : 'mr-3')} />
                            {!isCollapsed && <span className="truncate">{item.label}</span>}
                        </NavLink>
                    ))}
                </nav>

                {/* User Footer */}
                <div className={cn('border-t border-slate-800 p-2 shrink-0', isCollapsed ? '' : '')}>
                    <div className={cn('flex items-center rounded-xl p-2', isCollapsed ? 'justify-center' : 'gap-3')}>
                        <div className="relative shrink-0">
                            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {user?.NAME?.charAt(0) || 'U'}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900"></div>
                        </div>
                        {!isCollapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{user?.NAME}</p>
                                <p className="text-[10px] text-slate-500 capitalize">{user?.ROLE === 'system_admin' ? 'Sys Admin' : user?.ROLE}</p>
                            </div>
                        )}
                        <button
                            onClick={handleLogout}
                            className={cn('p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors', isCollapsed ? 'mt-1' : '')}
                            title="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </aside>

            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Desktop Topbar */}
                <header className="hidden md:flex h-16 items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0 z-10">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{currentPage?.label || 'Dashboard'}</h2>
                        <p className="text-xs text-slate-400 font-medium">Hello, {user?.NAME?.split(' ')[0] || 'User'}</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider',
                            role === 'admin' ? 'bg-red-50 text-red-600' :
                            role === 'supervisor' ? 'bg-violet-50 text-violet-600' :
                            role === 'system_admin' ? 'bg-teal-50 text-teal-600' :
                            'bg-blue-50 text-blue-600'
                        )}>
                            {role === 'system_admin' ? 'Sys Admin' : role}
                        </div>
                        <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                            {user?.NAME?.charAt(0) || 'U'}
                        </div>
                    </div>
                </header>

                {/* Mobile Topbar */}
                <header className="md:hidden flex h-14 items-center justify-between px-4 bg-white border-b border-slate-200 z-20 sticky top-0 shrink-0">
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 -ml-1 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-black text-xs">D</span>
                        </div>
                        <span className="font-bold text-slate-900">DOK HR</span>
                    </div>
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {user?.NAME?.charAt(0) || 'U'}
                    </div>
                </header>

                {/* Mobile Drawer */}
                {isMobileMenuOpen && (
                    <div className="md:hidden fixed inset-0 z-50">
                        <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)}></div>
                        <div className="absolute left-0 top-0 h-full w-72 bg-slate-900 flex flex-col shadow-2xl">
                            <div className="flex items-center justify-between h-14 px-4 border-b border-slate-800">
                                <div className="flex items-center space-x-3">
                                    <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                                        <span className="text-white font-black text-sm">D</span>
                                    </div>
                                    <span className="text-white font-bold">DOK Systems</span>
                                </div>
                                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1.5 text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                                {filtered.map((item) => (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={item.to === "/"}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={({ isActive }) => cn(
                                            'flex items-center space-x-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all',
                                            isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        )}
                                    >
                                        <item.icon className="w-5 h-5 shrink-0" />
                                        <span>{item.label}</span>
                                    </NavLink>
                                ))}
                            </nav>
                            <div className="p-4 border-t border-slate-800">
                                <div className="flex items-center gap-3 mb-3 px-2">
                                    <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                                        {user?.NAME?.charAt(0) || 'U'}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">{user?.NAME}</p>
                                        <p className="text-xs text-slate-400 capitalize">{user?.ROLE === 'system_admin' ? 'Sys Admin' : user?.ROLE}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors text-sm font-semibold"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto bg-slate-100">
                    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-24 md:pb-6">
                        <Outlet />
                    </div>
                </main>

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 safe-bottom">
                    <div className="flex items-center justify-around px-2 py-1">
                        {filtered.slice(0, 5).map((item) => {
                            const isActive = item.to === '/'
                                ? location.pathname === '/'
                                : location.pathname.startsWith(item.to);
                            return (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.to === "/"}
                                    className="flex flex-col items-center py-1.5 px-3 min-w-0"
                                >
                                    <div className={cn(
                                        'p-1.5 rounded-xl transition-all',
                                        isActive ? 'bg-indigo-100' : ''
                                    )}>
                                        <item.icon className={cn('w-5 h-5 transition-colors', isActive ? 'text-indigo-600' : 'text-slate-400')} />
                                    </div>
                                    <span className={cn('text-[10px] font-semibold mt-0.5 truncate', isActive ? 'text-indigo-600' : 'text-slate-400')}>
                                        {item.shortLabel}
                                    </span>
                                </NavLink>
                            );
                        })}
                        {filtered.length > 5 && (
                            <button
                                onClick={() => setIsMobileMenuOpen(true)}
                                className="flex flex-col items-center py-1.5 px-3"
                            >
                                <div className="p-1.5 rounded-xl">
                                    <Menu className="w-5 h-5 text-slate-400" />
                                </div>
                                <span className="text-[10px] font-semibold mt-0.5 text-slate-400">More</span>
                            </button>
                        )}
                    </div>
                </nav>
            </div>
        </div>
    );
};

export default Layout;
