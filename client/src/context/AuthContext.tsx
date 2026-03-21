import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LoginResponse } from '../types';
import { useSessionTimeout } from '../hooks/useSessionTimeout';
import SessionTimeoutModal from '../components/SessionTimeoutModal';


interface AuthContextType {
    user: LoginResponse['user'] | null;
    token: string | null;
    login: (data: LoginResponse) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    role: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<LoginResponse['user'] | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
        setIsLoading(false);
    }, []);

    const login = (data: LoginResponse) => {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        navigate('/login');
    };

    // Session timeout hook - only active when user is authenticated
    const { showWarning, remainingSeconds, resetTimeout } = useSessionTimeout({
        onLogout: logout,
        timeoutDuration: 10 * 60 * 1000, // 10 minutes
        warningDuration: 1 * 60 * 1000, // 1 minute warning
    });

    const handleStayLoggedIn = () => {
        resetTimeout();
    };

    const handleLogoutNow = () => {
        logout();
    };

    return (
        <AuthContext.Provider value={{
            user,
            token,
            login,
            logout,
            isAuthenticated: !!token,
            isLoading,
            role: user?.ROLE || null
        }}>
            {children}

            {/* Session Timeout Warning Modal */}
            {!!token && (
                <SessionTimeoutModal
                    isOpen={showWarning}
                    remainingSeconds={remainingSeconds}
                    onStayLoggedIn={handleStayLoggedIn}
                    onLogoutNow={handleLogoutNow}
                />
            )}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
