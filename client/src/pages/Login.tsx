import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Eye, EyeOff, LogIn, AlertCircle, Building2 } from 'lucide-react';

const Login: React.FC = () => {
    const [epfNumber, setEpfNumber] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const response = await api.post('/auth/login', { epf_number: epfNumber, password });
            login(response.data);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid credentials. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const features = [
        { label: 'Multi-site Management' },
        { label: 'Team & Role Control' },
        { label: 'Daily Task Tracking' },
        { label: 'Payroll Calculation' },
        { label: 'Reports & Analytics' },
    ];

    return (
        <div className="min-h-screen flex bg-slate-50">
            <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-indigo-950 via-indigo-900 to-blue-900 relative overflow-hidden flex-col items-center justify-center p-12">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/5 rounded-full"></div>
                    <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-white/5 rounded-full"></div>
                    <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
                </div>
                <div className="relative z-10 text-center">
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl border border-white/20">
                        <Building2 className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight mb-3">DOK Systems</h1>
                    <p className="text-indigo-200 text-lg font-medium mb-12">Human Resources Platform</p>
                    <div className="space-y-4 text-left max-w-xs mx-auto">
                        {features.map((item, i) => (
                            <div key={i} className="flex items-center space-x-3 text-indigo-100">
                                <div className="w-5 h-5 rounded-full bg-indigo-400/30 flex items-center justify-center">
                                    <div className="w-2 h-2 rounded-full bg-indigo-300"></div>
                                </div>
                                <span className="font-medium text-sm">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <p className="relative z-10 mt-auto text-indigo-300/50 text-xs">2025 DOK Systems. All rights reserved</p>
            </div>

            <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-md">
                    <div className="lg:hidden flex items-center space-x-3 mb-10">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="font-black text-slate-900 text-lg leading-none">DOK Systems</p>
                            <p className="text-slate-500 text-xs">HR Platform</p>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Welcome back</h2>
                        <p className="text-slate-500 mt-2">Sign in to your account to continue</p>
                    </div>

                    {error && (
                        <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-2xl mb-6">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 font-medium">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">EPF Number</label>
                            <input
                                type="text"
                                required
                                autoFocus
                                value={epfNumber}
                                onChange={(e) => setEpfNumber(e.target.value)}
                                className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors font-medium"
                                placeholder="e.g. ADMIN001"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors font-medium pr-12"
                                    placeholder="Enter your password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center space-x-2 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <>
                                    <LogIn className="w-5 h-5" />
                                    <span>Sign In</span>
                                </>
                            )}
                        </button>
                    </form>

                    <p className="text-center text-xs text-slate-400 mt-8">
                        Contact your administrator if you have trouble signing in
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
