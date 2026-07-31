import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { User, Site } from '../types';
import { localDateStr } from '../lib/utils';
import { Plus, Edit, UserCircle, MapPin, Shield, Users as UsersIcon, X, CheckCircle, XCircle, AlertTriangle, Search, Trash2, KeyRound, Eye, EyeOff, ArrowRightLeft, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface TempAssignment {
    ID: number;
    STAFF_ID: number;
    SITE_ID: number;
    SITE_NO: string;
    SITE_NAME: string;
    START_DATE: string;
    END_DATE: string | null; // null = indefinite ("permanent secondary site"), not date-bound
    NOTE: string | null;
}

// Not-yet-saved assignments collected while creating a brand new staff member —
// there's no staff_id to attach them to until the user is actually created.
interface PendingAssignment {
    key: string;
    site_id: number;
    start_date: string;
    end_date: string | null;
    note: string;
}

const ASSIGNMENT_MANAGER_ROLES = ['admin', 'system_admin', 'supervisor'];

const Users: React.FC = () => {
    const { role: currentUserRole } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [roleFilter, setRoleFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [epfNumber, setEpfNumber] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('staff');
    const [status, setStatus] = useState('active');
    const [siteId, setSiteId] = useState<number | string>('');
    const [basicSalary, setBasicSalary] = useState<number | string>('');
    const [otPercentage, setOtPercentage] = useState<number | string>('');
    const [fixSalary, setFixSalary] = useState<number | string>('');
    const [saving, setSaving] = useState(false);

    // Reset password modal
    const [resetUser, setResetUser]       = useState<User | null>(null);
    const [resetPwd, setResetPwd]         = useState('');
    const [resetShowPwd, setResetShowPwd] = useState(false);
    const [resetSaving, setResetSaving]   = useState(false);

    // Member detail panel
    const [viewingUser, setViewingUser] = useState<User | null>(null);
    const [panelTempSites, setPanelTempSites] = useState<TempAssignment[]>([]);
    const [panelTempLoading, setPanelTempLoading] = useState(false);

    // Temporary assignments (shown inside the add/edit modal)
    const [assignments, setAssignments]             = useState<TempAssignment[]>([]);
    const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
    const [assignSiteId, setAssignSiteId]     = useState<string>('');
    const [assignStart, setAssignStart]       = useState<string>('');
    const [assignEnd, setAssignEnd]           = useState<string>('');
    const [assignPermanent, setAssignPermanent] = useState(false);
    const [assignNote, setAssignNote]         = useState<string>('');
    const [assignSaving, setAssignSaving]     = useState(false);

    // Count of each staff member's currently-active temporary assignments, for the "+N" table badge
    const [activeAssignmentCounts, setActiveAssignmentCounts] = useState<Record<number, number>>({});

    useEffect(() => {
        const t = setTimeout(() => { fetchUsers(); fetchSites(); fetchActiveAssignmentCounts(); }, 300);
        return () => clearTimeout(t);
    }, [roleFilter, searchQuery]);

    useEffect(() => {
        if (viewingUser) fetchPanelTempSites(viewingUser.ID);
    }, [viewingUser]);

    const fetchUsers = async () => {
        try {
            let url = roleFilter ? `/users?role=${roleFilter}` : '/users';
            if (searchQuery) url += (url.includes('?') ? '&' : '?') + `search=${encodeURIComponent(searchQuery)}`;
            const r = await api.get(url); setUsers(r.data);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const fetchSites = async () => {
        try { const r = await api.get('/sites'); setSites(r.data); }
        catch (e) { console.error(e); }
    };

    const fetchAssignments = async (userId: number) => {
        try {
            const r = await api.get(`/assignments?staff_id=${userId}`);
            setAssignments(r.data);
        } catch { setAssignments([]); }
    };

    const fetchActiveAssignmentCounts = async () => {
        try {
            const r = await api.get('/assignments?active=1');
            const counts: Record<number, number> = {};
            (r.data as TempAssignment[]).forEach(a => { counts[a.STAFF_ID] = (counts[a.STAFF_ID] || 0) + 1; });
            setActiveAssignmentCounts(counts);
        } catch { setActiveAssignmentCounts({}); }
    };

    const fetchPanelTempSites = async (userId: number) => {
        setPanelTempSites([]);
        setPanelTempLoading(true);
        try {
            const r = await api.get(`/assignments?staff_id=${userId}&active=1`);
            setPanelTempSites(r.data);
        } catch { /* silently ignore — panel still shows permanent sites */ }
        finally { setPanelTempLoading(false); }
    };

    const canManageAssignments = ASSIGNMENT_MANAGER_ROLES.includes(currentUserRole ?? '');

    const handleOpenModal = (user?: User) => {
        if (user) {
            setEditingUser(user); setEpfNumber(user.EPF_NUMBER); setName(user.NAME);
            setRole(user.ROLE); setStatus(user.INACTIVATION_REQUESTED ? 'inactive' : (user.STATUS || 'active')); setSiteId(user.SITE_ID || '');
            setBasicSalary(user.BASIC_SALARY || ''); setOtPercentage(user.OT_PERCENTAGE || ''); setFixSalary(user.FIX_SALARY || ''); setPassword('');
            if (canManageAssignments) fetchAssignments(user.ID);
        } else {
            setEditingUser(null); setEpfNumber(''); setName(''); setRole('staff');
            setStatus('active'); setSiteId(''); setBasicSalary(''); setOtPercentage(''); setFixSalary(''); setPassword('');
            setAssignments([]);
        }
        setPendingAssignments([]);
        setAssignSiteId(''); setAssignStart(''); setAssignEnd(''); setAssignPermanent(false); setAssignNote('');
        setIsModalOpen(true);
    };

    // Editing an existing user posts the assignment immediately; creating a new one has no
    // staff_id yet, so it's queued in pendingAssignments and created after the user is saved.
    const handleCreateAssignment = async () => {
        if (!assignSiteId || !assignStart || (!assignPermanent && !assignEnd)) {
            alert('Select a site, a start date, and either an end date or "Permanent"'); return;
        }
        const endDate = assignPermanent ? null : assignEnd;
        if (!editingUser) {
            setPendingAssignments(prev => [...prev, {
                key: `${Date.now()}-${Math.random()}`,
                site_id: Number(assignSiteId),
                start_date: assignStart,
                end_date: endDate,
                note: assignNote,
            }]);
            setAssignSiteId(''); setAssignStart(''); setAssignEnd(''); setAssignPermanent(false); setAssignNote('');
            return;
        }
        setAssignSaving(true);
        try {
            await api.post('/assignments', {
                staff_id: editingUser.ID,
                site_id: Number(assignSiteId),
                start_date: assignStart,
                end_date: endDate,
                note: assignNote || undefined
            });
            setAssignSiteId(''); setAssignStart(''); setAssignEnd(''); setAssignPermanent(false); setAssignNote('');
            fetchAssignments(editingUser.ID);
            fetchActiveAssignmentCounts();
        } catch (err: any) { alert(err.response?.data?.message || 'Failed to create assignment'); }
        finally { setAssignSaving(false); }
    };

    const handleDeleteAssignment = async (id: number) => {
        if (!confirm('Remove this temporary assignment?')) return;
        try {
            await api.delete(`/assignments/${id}`);
            if (editingUser) fetchAssignments(editingUser.ID);
            fetchActiveAssignmentCounts();
        } catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
    };

    const removePendingAssignment = (key: string) => {
        setPendingAssignments(prev => prev.filter(p => p.key !== key));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setSaving(true);
        try {
            const payload: any = {};
            if (currentUserRole !== 'supervisor') {
                payload.epf_number = epfNumber; payload.name = name; payload.role = role;
                payload.site_id = siteId ? Number(siteId) : null; payload.status = status;
                if (password) payload.password = password;
                payload.basic_salary = basicSalary ? Number(basicSalary) : 0;
                payload.ot_percentage = otPercentage ? Number(otPercentage) : 0;
                payload.fix_salary = fixSalary ? Number(fixSalary) : 0;
            }
            if (editingUser) {
                await api.patch(`/users/${editingUser.ID}`, payload);
            } else {
                if (currentUserRole === 'supervisor') { alert('Supervisors cannot create users.'); return; }
                if (!password) { alert('Password required'); return; }
                const created = await api.post('/users', payload);
                const newStaffId = created.data?.id;
                if (newStaffId && pendingAssignments.length > 0) {
                    const results = await Promise.allSettled(pendingAssignments.map(pa => api.post('/assignments', {
                        staff_id: newStaffId,
                        site_id: pa.site_id,
                        start_date: pa.start_date,
                        end_date: pa.end_date,
                        note: pa.note || undefined,
                    })));
                    const failed = results.filter(r => r.status === 'rejected').length;
                    if (failed > 0) alert(`Member created, but ${failed} of ${pendingAssignments.length} site assignment(s) failed to save.`);
                }
            }
            setIsModalOpen(false); fetchUsers(); fetchActiveAssignmentCounts();
        } catch (err: any) { alert(err.response?.data?.message || 'Failed to save user'); }
        finally { setSaving(false); }
    };

    const handleFlagInactivation = async () => {
        if (!editingUser) return;
        if (!['admin', 'system_admin'].includes(currentUserRole || '')) return;
        if (!confirm('Flag this user for inactivation? An admin will review this.')) return;
        try {
            await api.patch(`/users/${editingUser.ID}`, { inactivation_requested: 1 });
            setIsModalOpen(false); fetchUsers(); alert('User flagged.');
        } catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Permanently delete this user? This cannot be undone.')) return;
        try { await api.delete(`/users/${id}`); fetchUsers(); }
        catch (err: any) { alert(err.response?.data?.message || 'Failed'); }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetUser || !resetPwd) return;
        if (resetPwd.length < 6) { alert('Password must be at least 6 characters'); return; }
        setResetSaving(true);
        try {
            await api.patch(`/users/${resetUser.ID}`, { password: resetPwd });
            setResetUser(null); setResetPwd('');
            alert(`Password updated for ${resetUser.NAME}`);
        } catch (err: any) { alert(err.response?.data?.message || 'Failed to reset password'); }
        finally { setResetSaving(false); }
    };

    const getRoleConfig = (r: string) => {
        switch (r) {
            case 'admin': return { bg: 'bg-red-100', text: 'text-red-700', icon: Shield };
            case 'supervisor': return { bg: 'bg-violet-100', text: 'text-violet-700', icon: UsersIcon };
            default: return { bg: 'bg-blue-100', text: 'text-blue-700', icon: UserCircle };
        }
    };

    const filterButtons = [
        { key: '', label: 'All', count: users.length },
        { key: 'admin', label: 'Admins' },
        { key: 'supervisor', label: 'Supervisors' },
        { key: 'staff', label: 'Staff' },
    ];

    if (loading) return (
        <div className="space-y-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse"></div>)}
        </div>
    );

    return (
        <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Team Management</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''}</p>
                </div>
                {currentUserRole === 'admin' && (
                    <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all shadow-sm text-sm">
                        <Plus className="w-4 h-4" /> Add Member
                    </button>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search name or EPF number..."
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 form-input" />
                </div>
                {currentUserRole === 'admin' && (
                    <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
                        {filterButtons.map(btn => (
                            <button key={btn.key} onClick={() => setRoleFilter(btn.key)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${roleFilter === btn.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                {btn.label}{btn.count !== undefined ? ` (${btn.count})` : ''}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">EPF</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Site</th>
                                {['admin', 'system_admin'].includes(currentUserRole ?? '') && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Basic Salary</th>}
                                {['admin', 'system_admin'].includes(currentUserRole ?? '') && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">OT%</th>}
                                {['admin', 'system_admin'].includes(currentUserRole ?? '') && <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Fix Salary</th>}
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {users.map((user) => {
                                const userSite = sites.find(s => s.ID === user.SITE_ID);
                                const cfg = getRoleConfig(user.ROLE);
                                const Icon = cfg.icon;
                                return (
                                    <tr key={user.ID} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 ${cfg.bg} rounded-full flex items-center justify-center shrink-0`}>
                                                    <Icon className={`w-4 h-4 ${cfg.text}`} />
                                                </div>
                                                <span className="font-semibold text-sm text-slate-900">{user.NAME}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className="text-sm text-slate-500 font-mono">{user.EPF_NUMBER}</span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${cfg.bg} ${cfg.text}`}>{user.ROLE}</span>
                                        </td>
                                        <td className="px-5 py-3.5 hidden md:table-cell">
                                            <div className="flex items-center gap-1.5">
                                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-sm text-slate-500">{userSite ? userSite.SITE_NO : '—'}</span>
                                                {!!activeAssignmentCounts[user.ID] && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full shrink-0"
                                                        title={`${activeAssignmentCounts[user.ID]} additional active site assignment${activeAssignmentCounts[user.ID] > 1 ? 's' : ''}`}>
                                                        +{activeAssignmentCounts[user.ID]}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {['admin', 'system_admin'].includes(currentUserRole ?? '') && (
                                            <td className="px-5 py-3.5 hidden lg:table-cell">
                                                <span className="text-sm text-slate-600 font-medium">{user.BASIC_SALARY ? `Rs. ${Number(user.BASIC_SALARY).toLocaleString()}` : '—'}</span>
                                            </td>
                                        )}
                                        {['admin', 'system_admin'].includes(currentUserRole ?? '') && (
                                            <td className="px-5 py-3.5 hidden lg:table-cell">
                                                <span className="text-sm text-slate-500">{user.OT_PERCENTAGE ? `${user.OT_PERCENTAGE}%` : '—'}</span>
                                            </td>
                                        )}
                                        {['admin', 'system_admin'].includes(currentUserRole ?? '') && (
                                            <td className="px-5 py-3.5 hidden lg:table-cell">
                                                <span className="text-sm text-slate-600 font-medium">{user.FIX_SALARY ? `Rs. ${Number(user.FIX_SALARY).toLocaleString()}` : '—'}</span>
                                            </td>
                                        )}
                                        <td className="px-5 py-3.5">
                                            {user.INACTIVATION_REQUESTED ? (
                                                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600"><AlertTriangle className="w-3 h-3" /> Flagged</span>
                                            ) : user.STATUS === 'active' ? (
                                                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><CheckCircle className="w-3 h-3" /> Active</span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-[11px] font-bold text-red-500"><XCircle className="w-3 h-3" /> Inactive</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => setViewingUser(user)} className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors" title="View">
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                                {['admin', 'system_admin', 'supervisor'].includes(currentUserRole || '') && (
                                                    <button onClick={() => handleOpenModal(user)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Edit">
                                                        <Edit className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {['admin', 'system_admin'].includes(currentUserRole || '') && (
                                                    <button onClick={() => { setResetUser(user); setResetPwd(''); setResetShowPwd(false); }}
                                                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-colors" title="Reset Password">
                                                        <KeyRound className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {['admin', 'system_admin'].includes(currentUserRole || '') && (
                                                    <button onClick={() => handleDelete(user.ID)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors" title="Delete">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {users.length === 0 && (
                    <div className="py-12 text-center">
                        <UsersIcon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400 text-sm font-medium">No team members found</p>
                    </div>
                )}
            </div>

            {/* ── Reset Password Modal ── */}
            {resetUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setResetUser(null)} />
                    <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                                    <KeyRound className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-slate-900">Reset Password</h2>
                                    <p className="text-xs text-slate-400 mt-0.5">{resetUser.NAME}</p>
                                </div>
                            </div>
                            <button onClick={() => setResetUser(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">New Password</label>
                                <div className="relative">
                                    <input
                                        type={resetShowPwd ? 'text' : 'password'}
                                        value={resetPwd}
                                        onChange={e => setResetPwd(e.target.value)}
                                        className="w-full px-3.5 py-2.5 pr-10 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                                        placeholder="Min. 6 characters"
                                        required minLength={6}
                                    />
                                    <button type="button" onClick={() => setResetShowPwd(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        {resetShowPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setResetUser(null)}
                                    className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">
                                    Cancel
                                </button>
                                <button type="submit" disabled={resetSaving}
                                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                                    {resetSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                    Set Password
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">{editingUser ? 'Edit Member' : 'Add New Member'}</h2>
                                <p className="text-xs text-slate-400 mt-0.5">{editingUser ? 'Update member information' : 'Add a new team member'}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-6">
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">EPF Number *</label>
                                        <input type="text" required disabled={!!editingUser && currentUserRole !== 'admin'} value={epfNumber} onChange={e => setEpfNumber(e.target.value)}
                                            className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm disabled:bg-slate-50"
                                            placeholder="EPF12345" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name *</label>
                                        <input type="text" required disabled={!!editingUser} value={name} onChange={e => setName(e.target.value)}
                                            className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm disabled:bg-slate-50"
                                            placeholder="John Doe" />
                                    </div>
                                </div>

                                {!editingUser && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Password *</label>
                                        <input type="password" required={!editingUser} value={password} onChange={e => setPassword(e.target.value)}
                                            className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                                            placeholder="Secure password" />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-2">Role *</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['staff', 'supervisor', 'admin'].map(r => {
                                            const c = getRoleConfig(r);
                                            const Icon = c.icon;
                                            return (
                                                <button key={r} type="button" onClick={() => setRole(r)}
                                                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-xs font-bold capitalize ${role === r ? `border-transparent ${c.bg} ${c.text}` : 'border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                                                    <Icon className="w-4 h-4" />{r}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Site Assignment</label>
                                    <select value={siteId} onChange={e => setSiteId(e.target.value)}
                                        className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm">
                                        <option value="">No Site</option>
                                        {sites.map(s => <option key={s.ID} value={s.ID}>{s.SITE_NO} - {s.NAME}</option>)}
                                    </select>
                                </div>

                                {['admin', 'system_admin'].includes(currentUserRole ?? '') && (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Basic Salary (Rs.)</label>
                                            <input type="number" min="0" step="1" value={basicSalary} onChange={e => setBasicSalary(e.target.value)}
                                                onKeyDown={e => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
                                                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="0" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">OT Percentage (%)</label>
                                            <input type="number" min="0" max="100" step="1" value={otPercentage} onChange={e => setOtPercentage(e.target.value)}
                                                onKeyDown={e => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
                                                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="0" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fix Salary (Rs.)</label>
                                            <input type="number" min="0" step="1" value={fixSalary} onChange={e => setFixSalary(e.target.value)}
                                                onKeyDown={e => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
                                                className="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-sm" placeholder="0" />
                                        </div>
                                    </div>
                                )}

                                {currentUserRole === 'admin' ? (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-2">Status *</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button type="button" onClick={() => setStatus('active')}
                                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${status === 'active' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>
                                                <CheckCircle className="w-4 h-4" /> Active
                                            </button>
                                            <button type="button" onClick={() => setStatus('inactive')}
                                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${status === 'inactive' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-400'}`}>
                                                <XCircle className="w-4 h-4" /> Inactive
                                            </button>
                                        </div>
                                    </div>
                                ) : editingUser && (
                                    <button type="button" onClick={handleFlagInactivation} disabled={!!editingUser.INACTIVATION_REQUESTED}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-50 border-2 border-amber-200 text-amber-700 rounded-xl font-semibold text-sm hover:bg-amber-100 transition-colors disabled:opacity-50">
                                        <AlertTriangle className="w-4 h-4" />
                                        {editingUser.INACTIVATION_REQUESTED ? 'Inactivation Requested' : 'Flag for Inactivation'}
                                    </button>
                                )}

                                {/* Multiple site assignments — available for both creating a new member and editing an existing one */}
                                {canManageAssignments && (
                                    <div className="border-t-2 border-slate-100 pt-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                                            <span className="text-sm font-bold text-slate-700">Additional Sites</span>
                                            <span className="text-xs text-slate-400">(counts only — no salary at secondary site)</span>
                                        </div>

                                        {/* Existing assignments (editing) */}
                                        {editingUser && assignments.length > 0 && (
                                            <div className="space-y-1.5">
                                                {assignments.map(a => {
                                                    const now = localDateStr();
                                                    const isPermanent = !a.END_DATE;
                                                    const isActive = a.START_DATE <= now && (isPermanent || now <= a.END_DATE!);
                                                    return (
                                                        <div key={a.ID} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${isActive ? (isPermanent ? 'border-blue-300 bg-blue-50' : 'border-amber-300 bg-amber-50') : 'border-slate-200 bg-slate-50'}`}>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <MapPin className={`w-3.5 h-3.5 shrink-0 ${isActive ? (isPermanent ? 'text-blue-600' : 'text-amber-600') : 'text-slate-400'}`} />
                                                                <span className="text-xs font-semibold text-slate-700 truncate">{a.SITE_NO} — {a.SITE_NAME}</span>
                                                                <span className="text-xs text-slate-400 shrink-0">{isPermanent ? `${a.START_DATE} →` : `${a.START_DATE} → ${a.END_DATE}`}</span>
                                                                {isPermanent
                                                                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded-full shrink-0">Permanent</span>
                                                                    : isActive && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full shrink-0">Active</span>}
                                                            </div>
                                                            <button type="button" onClick={() => handleDeleteAssignment(a.ID)}
                                                                className="p-1 text-red-400 hover:text-red-600 shrink-0">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Pending assignments (creating a new member — saved once the member is created) */}
                                        {!editingUser && pendingAssignments.length > 0 && (
                                            <div className="space-y-1.5">
                                                {pendingAssignments.map(pa => {
                                                    const site = sites.find(s => s.ID === pa.site_id);
                                                    return (
                                                        <div key={pa.key} className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                                                <span className="text-xs font-semibold text-slate-700 truncate">{site ? `${site.SITE_NO} — ${site.NAME}` : `Site #${pa.site_id}`}</span>
                                                                <span className="text-xs text-slate-400 shrink-0">{pa.end_date ? `${pa.start_date} → ${pa.end_date}` : `${pa.start_date} →`}</span>
                                                                {!pa.end_date && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded-full shrink-0">Permanent</span>}
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full shrink-0">Pending</span>
                                                            </div>
                                                            <button type="button" onClick={() => removePendingAssignment(pa.key)}
                                                                className="p-1 text-red-400 hover:text-red-600 shrink-0">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* New assignment form */}
                                        <div className="bg-slate-50 rounded-xl p-3 space-y-2.5 border border-slate-200">
                                            <p className="text-xs font-semibold text-slate-500">Add {editingUser ? 'New' : 'a'} Site</p>
                                            <select value={assignSiteId} onChange={e => setAssignSiteId(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500">
                                                <option value="">Select secondary site</option>
                                                {sites.filter(s => s.ID !== Number(siteId)).map(s =>
                                                    <option key={s.ID} value={s.ID}>{s.SITE_NO} — {s.NAME}</option>
                                                )}
                                            </select>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-xs text-slate-500 mb-1">Start Date</label>
                                                    <input type="date" value={assignStart} onChange={e => setAssignStart(e.target.value)}
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-slate-500 mb-1">End Date</label>
                                                    <input type="date" value={assignEnd} onChange={e => setAssignEnd(e.target.value)} disabled={assignPermanent}
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400" />
                                                </div>
                                            </div>
                                            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                                <input type="checkbox" checked={assignPermanent}
                                                    onChange={e => { setAssignPermanent(e.target.checked); if (e.target.checked) setAssignEnd(''); }} />
                                                Permanent (no end date)
                                            </label>
                                            <input type="text" placeholder="Note (optional)" value={assignNote} onChange={e => setAssignNote(e.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" />
                                            <button type="button" onClick={handleCreateAssignment} disabled={assignSaving}
                                                className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-60">
                                                {assignSaving
                                                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    : <><Calendar className="w-3.5 h-3.5" /> {editingUser ? 'Assign' : 'Add'}</>
                                                }
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors text-sm">Cancel</button>
                                    {(currentUserRole === 'admin' || currentUserRole === 'supervisor') && (
                                        <button type="submit" disabled={saving}
                                            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                                            {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                                            {editingUser ? 'Save Changes' : 'Add Member'}
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Member Detail Slide-Over ── */}
            {viewingUser && (() => {
                const cfg = getRoleConfig(viewingUser.ROLE);
                const Icon = cfg.icon;
                const permanentSite = sites.find(s => s.ID === viewingUser.SITE_ID);
                const supervisorSites = viewingUser.ROLE === 'supervisor'
                    ? sites.filter(s => s.SUPERVISOR_ID === viewingUser.ID)
                    : [];
                const siteCards: { site: Site; tag: 'Home' | 'Manages' | 'Permanent' | 'Temp' }[] = [];
                if (viewingUser.ROLE === 'supervisor') {
                    supervisorSites.forEach(s => siteCards.push({ site: s, tag: 'Manages' }));
                } else if (permanentSite) {
                    siteCards.push({ site: permanentSite, tag: 'Home' });
                }
                panelTempSites.forEach(ta => {
                    const site = sites.find(s => s.ID === ta.SITE_ID);
                    if (site) siteCards.push({ site, tag: ta.END_DATE ? 'Temp' : 'Permanent' });
                });
                const headerGradient = viewingUser.ROLE === 'admin' || viewingUser.ROLE === 'system_admin'
                    ? 'from-red-50 via-red-50/60 to-white'
                    : viewingUser.ROLE === 'supervisor'
                        ? 'from-violet-50 via-violet-50/60 to-white'
                        : 'from-blue-50 via-blue-50/60 to-white';
                const isAdminViewer = ['admin', 'system_admin'].includes(currentUserRole ?? '');
                return (
                    <>
                        {/* Backdrop */}
                        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => setViewingUser(null)} />
                        {/* Panel */}
                        <div className="fixed inset-y-0 right-0 z-50 w-[440px] bg-white shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">
                            {/* Hero Header */}
                            <div className={`bg-gradient-to-b ${headerGradient} px-6 pt-5 pb-7 shrink-0 relative`}>
                                <button onClick={() => setViewingUser(null)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/70 transition-colors" title="Close">
                                    <X className="w-4 h-4 text-slate-500" />
                                </button>
                                <div className="flex flex-col items-center text-center mt-1">
                                    <div className={`w-16 h-16 ${cfg.bg} rounded-2xl flex items-center justify-center shadow-sm mb-3 ring-4 ring-white`}>
                                        <Icon className={`w-8 h-8 ${cfg.text}`} />
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900 leading-tight">{viewingUser.NAME}</h2>
                                    <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${cfg.bg} ${cfg.text}`}>
                                            {viewingUser.ROLE.replace('_', ' ')}
                                        </span>
                                        {viewingUser.INACTIVATION_REQUESTED
                                            ? <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold"><AlertTriangle className="w-3 h-3" />Flagged</span>
                                            : viewingUser.STATUS === 'active'
                                                ? <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold"><CheckCircle className="w-3 h-3" />Active</span>
                                                : <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[11px] font-bold"><XCircle className="w-3 h-3" />Inactive</span>
                                        }
                                    </div>
                                </div>
                            </div>
                            {/* Scrollable body */}
                            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                                {/* EPF */}
                                <div className="px-6 py-4">
                                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">EPF Number</p>
                                    <p className="text-sm font-mono font-semibold text-slate-800">{viewingUser.EPF_NUMBER ?? '—'}</p>
                                </div>
                                {/* Compensation — admin/system_admin viewers only */}
                                {isAdminViewer && (
                                    <div className="px-6 py-4">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Compensation</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { label: 'Basic Salary', value: viewingUser.BASIC_SALARY ? `Rs. ${Number(viewingUser.BASIC_SALARY).toLocaleString()}` : '—' },
                                                { label: 'OT %', value: viewingUser.OT_PERCENTAGE ? `${viewingUser.OT_PERCENTAGE}%` : '—' },
                                                { label: 'Fix Salary', value: viewingUser.FIX_SALARY ? `Rs. ${Number(viewingUser.FIX_SALARY).toLocaleString()}` : '—' },
                                            ].map(({ label, value }) => (
                                                <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <p className="text-[10px] text-slate-400 font-medium mb-1 leading-tight">{label}</p>
                                                    <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Assigned Sites */}
                                <div className="px-6 py-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Assigned Sites</p>
                                        {siteCards.length > 0 && (
                                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{siteCards.length}</span>
                                        )}
                                    </div>
                                    {panelTempLoading ? (
                                        <div className="flex items-center justify-center gap-2 py-8">
                                            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-sm text-slate-400">Loading sites…</span>
                                        </div>
                                    ) : siteCards.length === 0 ? (
                                        <div className="py-10 text-center">
                                            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                                <MapPin className="w-6 h-6 text-slate-300" />
                                            </div>
                                            <p className="text-sm font-semibold text-slate-400">No site assigned</p>
                                            <p className="text-xs text-slate-300 mt-0.5">This member has no active site assignments</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {siteCards.map(({ site, tag }, i) => {
                                                const accent = tag === 'Home' ? 'border-l-slate-400' : tag === 'Manages' ? 'border-l-violet-500' : tag === 'Permanent' ? 'border-l-blue-400' : 'border-l-amber-400';
                                                const pill = tag === 'Home' ? 'bg-slate-100 text-slate-600' : tag === 'Manages' ? 'bg-violet-100 text-violet-700' : tag === 'Permanent' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
                                                return (
                                                    <div key={i} className={`flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 border-l-4 ${accent} shadow-sm`}>
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                                                                <MapPin className="w-4 h-4 text-slate-500" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-semibold text-slate-900 truncate">{site.NAME}</p>
                                                                <p className="text-xs font-mono text-slate-400">{site.SITE_NO}</p>
                                                            </div>
                                                        </div>
                                                        <span className={`ml-2 shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${pill}`}>{tag}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                );
            })()}
        </div>
    );
};

export default Users;
