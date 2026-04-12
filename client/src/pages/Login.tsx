import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

const FEATURES = [
    { title: 'Multi-site Operations',  desc: 'Manage teams across all your locations from one dashboard.' },
    { title: 'Smart Payroll Engine',   desc: 'Automated OT calculations, poya days, and salary processing.' },
    { title: 'Task & Attendance',      desc: 'Daily task sheets, time tracking, and attendance records.' },
    { title: 'Invoice & Analytics',    desc: 'Generate invoices and monitor site performance in real time.' },
];

const Login: React.FC = () => {
    const [epfNumber, setEpfNumber]   = useState('');
    const [password, setPassword]     = useState('');
    const [showPwd, setShowPwd]       = useState(false);
    const [error, setError]           = useState('');
    const [loading, setLoading]       = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/auth/login', { epf_number: epfNumber, password });
            login(res.data);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50">

            {/* ── Left brand panel ── */}
            <div className="hidden lg:flex lg:w-[44%] relative flex-col overflow-hidden bg-[#0f172a]">
                {/* Background blobs */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-32 -right-32 w-[480px] h-[480px] bg-indigo-600/10 rounded-full blur-3xl" />
                    <div className="absolute -bottom-24 -left-24 w-[360px] h-[360px] bg-purple-600/10 rounded-full blur-3xl" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-2xl" />
                    {/* Grid overlay */}
                    <div className="absolute inset-0 opacity-[0.03]"
                        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                </div>

                <div className="relative z-10 flex flex-col h-full p-12">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/50">
                            <span className="text-white font-black text-base">D</span>
                        </div>
                        <div>
                            <p className="text-white font-bold text-[15px] leading-tight">DOK Systems</p>
                            <p className="text-slate-500 text-[11px] font-medium">HR Platform</p>
                        </div>
                    </div>

                    {/* Hero text */}
                    <div className="mt-auto mb-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-6">
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                            <span className="text-indigo-300 text-[11px] font-semibold tracking-wide">Human Resources Management</span>
                        </div>
                        <h1 className="text-[38px] font-black text-white leading-[1.1] tracking-tight">
                            Manage your<br />
                            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                                workforce
                            </span>
                            <br />with confidence.
                        </h1>
                        <p className="text-slate-400 text-[14px] mt-5 leading-relaxed max-w-[340px]">
                            A complete HR operations suite built for multi-site companies — from task tracking to payroll automation.
                        </p>
                    </div>

                    {/* Features */}
                    <div className="space-y-3">
                        {FEATURES.map((f, i) => (
                            <div key={i} className="flex items-start gap-3 p-3.5 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:bg-white/[0.05] transition-colors">
                                <div className="w-6 h-6 bg-indigo-500/20 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                                </div>
                                <div>
                                    <p className="text-white text-[12.5px] font-semibold leading-tight">{f.title}</p>
                                    <p className="text-slate-500 text-[11.5px] mt-0.5 leading-snug">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="mt-8 text-slate-600 text-[11px]">© 2025 DOK Systems · All rights reserved</p>
                </div>
            </div>

            {/* ── Right form panel ── */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white">
                <div className="w-full max-w-[400px]">

                    {/* Mobile logo */}
                    <div className="lg:hidden flex items-center gap-2.5 mb-10">
                        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                            <span className="text-white font-black text-base">D</span>
                        </div>
                        <div>
                            <p className="font-black text-slate-900 text-[15px] leading-tight">DOK Systems</p>
                            <p className="text-slate-400 text-[11px]">HR Platform</p>
                        </div>
                    </div>

                    {/* Heading */}
                    <div className="mb-8">
                        <h2 className="text-[26px] font-black text-slate-900 tracking-tight leading-tight">Welcome back</h2>
                        <p className="text-slate-400 text-[13.5px] mt-1.5">Sign in to your account to continue</p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-100 rounded-xl mb-5">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-[13px] text-red-700 font-medium leading-snug">{error}</p>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="form-label">EPF Number</label>
                            <input
                                type="text"
                                required
                                autoFocus
                                value={epfNumber}
                                onChange={e => setEpfNumber(e.target.value)}
                                className="form-input"
                                placeholder="e.g. ADMIN001"
                                style={{ padding: '11px 14px', fontSize: '14px' }}
                            />
                        </div>
                        <div>
                            <label className="form-label">Password</label>
                            <div className="relative">
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="form-input pr-11"
                                    placeholder="Enter your password"
                                    style={{ padding: '11px 44px 11px 14px', fontSize: '14px' }}
                                />
                                <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                    {showPwd ? <EyeOff className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} /> : <Eye className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" disabled={loading}
                            className="btn btn-primary w-full mt-2"
                            style={{ padding: '12px 20px', fontSize: '14px', borderRadius: 12, marginTop: 8 }}>
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Signing in…
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="w-4 h-4 ml-0.5" />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="text-center text-[12px] text-slate-400 mt-8 leading-relaxed">
                        Having trouble? Contact your administrator<br />for account assistance.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
