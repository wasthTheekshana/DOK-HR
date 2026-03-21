import React from 'react';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';

interface SessionTimeoutModalProps {
    isOpen: boolean;
    remainingSeconds: number;
    onStayLoggedIn: () => void;
    onLogoutNow: () => void;
}

const SessionTimeoutModal: React.FC<SessionTimeoutModalProps> = ({
    isOpen,
    remainingSeconds,
    onStayLoggedIn,
    onLogoutNow,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 fade-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-2xl p-6">
                    <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Session Timeout Warning</h3>
                            <p className="text-amber-50 text-sm mt-0.5">Your session is about to expire</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-slate-600 text-sm leading-relaxed mb-6">
                        You've been inactive for a while. For your security, you will be automatically logged out in:
                    </p>

                    {/* Countdown Display */}
                    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-6 mb-6 border border-slate-200">
                        <div className="text-center">
                            <div className="text-5xl font-bold text-slate-800 tabular-nums tracking-tight">
                                {remainingSeconds}
                            </div>
                            <div className="text-sm font-medium text-slate-500 mt-2 uppercase tracking-wider">
                                {remainingSeconds === 1 ? 'Second' : 'Seconds'}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={onStayLoggedIn}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-600 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-[1.02]"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Stay Logged In
                        </button>
                        <button
                            onClick={onLogoutNow}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition-all duration-200 hover:scale-[1.02]"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout Now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionTimeoutModal;
