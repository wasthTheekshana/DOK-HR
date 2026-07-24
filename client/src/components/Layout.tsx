import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
    LayoutDashboard, Users, MapPin, ClipboardList, CalendarCheck,
    FileText, LogOut, Menu, X, ChevronLeft, ChevronRight,
    DollarSign, BarChart3, TrendingUp, Target, UserCog,
    Eye, EyeOff, Clock, LayoutGrid, PieChart, GitBranch, Award
} from 'lucide-react';
import { cn } from '../lib/utils';

/* ── Nav structure ─────────────────────────────────────── */
const NAV_GROUPS = [
    {
        label: 'Overview',
        items: [
            { to: '/',               label: 'Dashboard',       icon: LayoutDashboard, roles: ['admin','supervisor','staff','system_admin','project_manager'] },
        ]
    },
    {
        label: 'Management',
        items: [
            { to: '/sites',          label: 'Sites',           icon: MapPin,          roles: ['admin','supervisor','system_admin','project_manager'] },
            { to: '/users',          label: 'Team',            icon: Users,           roles: ['admin','supervisor','system_admin','project_manager'] },
            { to: '/tasks',          label: 'Daily Tasks',     icon: ClipboardList,   roles: ['admin','supervisor','staff'] },
            { to: '/attendance',     label: 'Attendance',      icon: CalendarCheck,   roles: ['admin','supervisor','system_admin','staff'] },
            { to: '/task-summary',   label: 'Task Summary',    icon: LayoutGrid,      roles: ['supervisor'] },
            { to: '/project-planning', label: 'Project Planning', icon: GitBranch,    roles: ['project_manager'] },
            { to: '/kpi', label: 'Staff KPI', icon: Award, roles: ['project_manager'] },
        ]
    },
    {
        label: 'Finance',
        items: [
            { to: '/payroll',        label: 'Payroll',         icon: DollarSign,      roles: ['admin','system_admin','project_manager'] },
            { to: '/extra-units',    label: 'Extra Units',     icon: TrendingUp,      roles: ['admin','system_admin','project_manager'] },
            { to: '/invoices',          label: 'Invoices',          icon: FileText,   roles: ['admin','system_admin','project_manager'] },
            { to: '/invoice-analysis', label: 'Invoice Analysis',  icon: PieChart,   roles: ['system_admin'] },
            { to: '/reports',          label: 'Reports',            icon: BarChart3,  roles: ['admin','project_manager'] },
        ]
    },
    {
        label: 'Analytics',
        items: [
            { to: '/analytics',             label: 'Analytics',           icon: TrendingUp,  roles: ['system_admin'] },
            { to: '/site-performance',      label: 'Target Performance',  icon: Target,      roles: ['system_admin'] },
            { to: '/time-site-performance', label: 'Time Site Analysis',  icon: Clock,       roles: ['system_admin'] },
            { to: '/task-summary',          label: 'Task Summary',        icon: LayoutGrid,  roles: ['admin','system_admin'] },
            { to: '/service-mindmap',       label: 'Service Analysis',    icon: GitBranch,   roles: ['system_admin'] },
        ]
    },
];

/* ── NavItem ────────────────────────────────────────────── */
const NavItem: React.FC<{ to: string; label: string; icon: React.ElementType; collapsed: boolean; onClick?: () => void }> =
    ({ to, label, icon: Icon, collapsed, onClick }) => (
        <NavLink
            to={to}
            end={to === '/'}
            onClick={onClick}
            title={collapsed ? label : undefined}
            className={({ isActive }) => cn(
                'group flex items-center gap-3 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 relative select-none',
                collapsed ? 'justify-center' : '',
                isActive
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            )}
        >
            {({ isActive }) => (
                <>
                    {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-indigo-400 rounded-r-full" />
                    )}
                    <Icon className={cn('shrink-0 transition-all', collapsed ? 'w-5 h-5' : 'w-4 h-4', isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300')} />
                    {!collapsed && <span className="truncate leading-none">{label}</span>}
                </>
            )}
        </NavLink>
    );

/* ── Main Layout ────────────────────────────────────────── */
const Layout: React.FC = () => {
    const { user, logout, role } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [collapsed, setCollapsed]   = useState(false);

    const isPrivileged = role === 'admin' || role === 'system_admin';

    /* ── Profile modal ── */
    const [showProfile, setShowProfile]       = useState(false);
    const [profileName, setProfileName]       = useState('');
    const [profilePwd, setProfilePwd]         = useState('');
    const [profileConfirm, setProfileConfirm] = useState('');
    const [profileShowPwd, setProfileShowPwd] = useState(false);
    const [profileSaving, setProfileSaving]   = useState(false);

    const openProfile = () => {
        if (!isPrivileged) return;
        setProfileName(user?.NAME || '');
        setProfilePwd(''); setProfileConfirm(''); setProfileShowPwd(false);
        setShowProfile(true);
    };

    const handleProfileSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.ID) return;
        if (profilePwd && profilePwd !== profileConfirm) { alert('Passwords do not match'); return; }
        if (profilePwd && profilePwd.length < 6) { alert('Password must be at least 6 characters'); return; }
        setProfileSaving(true);
        try {
            const payload: any = {};
            if (profileName && profileName !== user.NAME) payload.name = profileName;
            if (profilePwd) payload.password = profilePwd;
            if (!Object.keys(payload).length) { setShowProfile(false); return; }
            await api.patch(`/users/${user.ID}`, payload);
            setShowProfile(false);
        } catch (err: any) { alert(err.response?.data?.message || 'Failed to update profile'); }
        finally { setProfileSaving(false); }
    };

    const handleLogout = () => { logout(); navigate('/login'); };

    /* ── Filter nav groups by role ── */
    const filteredGroups = NAV_GROUPS.map(g => ({
        ...g,
        items: g.items.filter(i => i.roles.includes(role || ''))
    })).filter(g => g.items.length > 0);

    /* ── Current page label ── */
    const currentItem = NAV_GROUPS.flatMap(g => g.items).find(i =>
        i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)
    );

    /* ── Role badge ── */
    const roleBadge = {
        admin:           { label: 'Admin',      cls: 'bg-red-500/10 text-red-400' },
        supervisor:      { label: 'Supervisor', cls: 'bg-violet-500/10 text-violet-400' },
        system_admin:    { label: 'Sys Admin',  cls: 'bg-teal-500/10 text-teal-400' },
        staff:           { label: 'Staff',      cls: 'bg-blue-500/10 text-blue-400' },
        project_manager: { label: 'PM',         cls: 'bg-amber-500/10 text-amber-400' },
    }[role || 'staff'] ?? { label: role, cls: 'bg-slate-500/10 text-slate-400' };

    /* ── Sidebar content (shared between desktop + mobile) ── */
    const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className={cn('flex items-center h-[60px] border-b border-white/[0.06] shrink-0', collapsed ? 'justify-center px-3' : 'px-5 gap-3')}>
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-indigo-900/50">
                    <span className="text-white font-black text-sm tracking-tight">D</span>
                </div>
                {!collapsed && (
                    <div className="overflow-hidden">
                        <p className="text-white font-bold text-[14px] leading-tight tracking-tight">DOK Systems</p>
                        <p className="text-slate-500 text-[10px] font-medium mt-0.5">HR Platform</p>
                    </div>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 py-3 px-2.5 overflow-y-auto sidebar-scroll space-y-0.5">
                {filteredGroups.map((group, gi) => (
                    <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
                        {!collapsed && (
                            <p className="nav-section-label">{group.label}</p>
                        )}
                        {collapsed && gi > 0 && <div className="h-px bg-white/[0.05] mx-1 my-2" />}
                        {group.items.map(item => (
                            <NavItem
                                key={item.to}
                                to={item.to}
                                label={item.label}
                                icon={item.icon}
                                collapsed={collapsed}
                                onClick={onNav}
                            />
                        ))}
                    </div>
                ))}
            </nav>

            {/* User footer */}
            <div className="border-t border-white/[0.06] p-2.5 shrink-0">
                {!collapsed ? (
                    <div className="flex items-center gap-2.5 px-1 py-1">
                        <button onClick={openProfile} disabled={!isPrivileged}
                            title={isPrivileged ? 'My Profile' : undefined}
                            className={cn('relative shrink-0', isPrivileged ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default')}>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                                {user?.NAME?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold text-white truncate leading-tight">{user?.NAME}</p>
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', roleBadge.cls)}>{roleBadge.label}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                            {isPrivileged && (
                                <button onClick={openProfile} title="My Profile"
                                    className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-all">
                                    <UserCog className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button onClick={handleLogout} title="Sign out"
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                                <LogOut className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-2">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                                {user?.NAME?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900" />
                        </div>
                        <button onClick={handleLogout} title="Sign out"
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">

            {/* ── Desktop Sidebar ── */}
            <aside className={cn(
                'hidden md:flex flex-col bg-[#0f172a] border-r border-white/[0.05] z-30 shrink-0 transition-all duration-300 ease-in-out relative',
                collapsed ? 'w-[62px]' : 'w-[220px]'
            )}>
                <SidebarContent />

                {/* Collapse toggle */}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="absolute -right-3 top-[72px] w-6 h-6 bg-slate-800 hover:bg-indigo-600 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all z-40 shadow-md"
                >
                    {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
                </button>
            </aside>

            {/* ── Main content ── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

                {/* Desktop topbar */}
                <header className="hidden md:flex h-[60px] items-center justify-between px-6 bg-white border-b border-slate-200/80 shrink-0 z-10">
                    <div>
                        <h1 className="text-[15px] font-semibold text-slate-900 leading-tight">
                            {currentItem?.label || 'Dashboard'}
                        </h1>
                        <p className="text-[11.5px] text-slate-400 mt-0.5">
                            Welcome back, <span className="text-slate-600 font-medium">{user?.NAME?.split(' ')[0]}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={cn(
                            'px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider',
                            role === 'admin'           ? 'bg-red-50 text-red-600 border border-red-100' :
                            role === 'system_admin'    ? 'bg-teal-50 text-teal-600 border border-teal-100' :
                            role === 'supervisor'      ? 'bg-violet-50 text-violet-600 border border-violet-100' :
                            role === 'project_manager' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                            'bg-blue-50 text-blue-600 border border-blue-100'
                        )}>
                            {role === 'system_admin' ? 'Sys Admin' : role === 'project_manager' ? 'PM' : role}
                        </span>
                        <button
                            onClick={isPrivileged ? openProfile : undefined}
                            className={cn(
                                'w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-sm',
                                isPrivileged ? 'cursor-pointer hover:shadow-md hover:scale-105 transition-all' : 'cursor-default'
                            )}
                            title={isPrivileged ? 'My Profile' : undefined}
                        >
                            {user?.NAME?.charAt(0).toUpperCase() || 'U'}
                        </button>
                    </div>
                </header>

                {/* Mobile topbar */}
                <header className="md:hidden flex h-14 items-center justify-between px-4 bg-white border-b border-slate-200 z-20 sticky top-0 shrink-0">
                    <button onClick={() => setMobileOpen(true)} className="p-2 -ml-1 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                            <span className="text-white font-black text-xs">D</span>
                        </div>
                        <span className="font-bold text-slate-900 text-[14px]">DOK HR</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {user?.NAME?.charAt(0).toUpperCase() || 'U'}
                    </div>
                </header>

                {/* Mobile drawer */}
                {mobileOpen && (
                    <div className="md:hidden fixed inset-0 z-50 flex">
                        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
                        <div className="relative w-[240px] bg-[#0f172a] flex flex-col shadow-2xl">
                            <div className="flex items-center justify-between h-14 px-4 border-b border-white/[0.06]">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
                                        <span className="text-white font-black text-sm">D</span>
                                    </div>
                                    <span className="text-white font-bold text-sm">DOK Systems</span>
                                </div>
                                <button onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <SidebarContent onNav={() => setMobileOpen(false)} />
                            </div>
                        </div>
                    </div>
                )}

                {/* Page content */}
                <main className="flex-1 overflow-y-auto">
                    <div className="p-4 md:p-6 max-w-[1320px] mx-auto pb-24 md:pb-8">
                        <Outlet />
                    </div>
                </main>

                {/* Mobile bottom nav */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-20 safe-bottom">
                    <div className="flex items-center justify-around px-1 py-1">
                        {filteredGroups.flatMap(g => g.items).slice(0, 5).map(item => {
                            const isActive = item.to === '/'
                                ? location.pathname === '/'
                                : location.pathname.startsWith(item.to);
                            return (
                                <NavLink key={item.to} to={item.to} end={item.to === '/'}
                                    className="flex flex-col items-center py-1.5 px-2.5 min-w-0">
                                    <div className={cn('p-1.5 rounded-xl transition-all', isActive ? 'bg-indigo-50' : '')}>
                                        <item.icon className={cn('w-5 h-5 transition-colors', isActive ? 'text-indigo-600' : 'text-slate-400')} />
                                    </div>
                                    <span className={cn('text-[9.5px] font-semibold mt-0.5 truncate max-w-[56px]', isActive ? 'text-indigo-600' : 'text-slate-400')}>
                                        {item.label.split(' ')[0]}
                                    </span>
                                </NavLink>
                            );
                        })}
                    </div>
                </nav>
            </div>

            {/* ── My Profile Modal ── */}
            {showProfile && isPrivileged && (
                <div className="modal-overlay" onClick={() => setShowProfile(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-[380px] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                                    <UserCog className="w-4.5 h-4.5 text-indigo-600" style={{ width: 18, height: 18 }} />
                                </div>
                                <div>
                                    <h2 className="text-[14px] font-bold text-slate-900">My Profile</h2>
                                    <p className="text-[11px] text-slate-400">{roleBadge.label}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowProfile(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleProfileSave} className="p-6 space-y-4">
                            <div>
                                <label className="form-label">Display Name</label>
                                <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)}
                                    className="form-input" placeholder="Your name" />
                            </div>
                            <div className="pt-1 border-t border-slate-100">
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                    Change Password <span className="font-normal normal-case text-slate-300">— leave blank to keep current</span>
                                </p>
                                <div className="space-y-2.5">
                                    <div className="relative">
                                        <input type={profileShowPwd ? 'text' : 'password'}
                                            value={profilePwd} onChange={e => setProfilePwd(e.target.value)}
                                            className="form-input pr-10" placeholder="New password (min. 6 chars)" />
                                        <button type="button" onClick={() => setProfileShowPwd(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                            {profileShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <input type={profileShowPwd ? 'text' : 'password'}
                                        value={profileConfirm} onChange={e => setProfileConfirm(e.target.value)}
                                        className="form-input" placeholder="Confirm new password" />
                                </div>
                            </div>
                            <div className="flex gap-2.5 pt-1">
                                <button type="button" onClick={() => setShowProfile(false)} className="btn btn-ghost flex-1">Cancel</button>
                                <button type="submit" disabled={profileSaving} className="btn btn-primary flex-1">
                                    {profileSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Layout;
