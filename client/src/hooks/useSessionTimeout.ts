import { useEffect, useRef, useState, useCallback } from 'react';

interface UseSessionTimeoutProps {
    onLogout: () => void;
    timeoutDuration?: number; // in milliseconds
    warningDuration?: number; // in milliseconds before timeout to show warning
}

interface UseSessionTimeoutReturn {
    showWarning: boolean;
    remainingSeconds: number;
    resetTimeout: () => void;
}

export const useSessionTimeout = ({
    onLogout,
    timeoutDuration = 10 * 60 * 1000, // 10 minutes default
    warningDuration = 1 * 60 * 1000, // 1 minute warning default
}: UseSessionTimeoutProps): UseSessionTimeoutReturn => {
    const [showWarning, setShowWarning] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState(0);

    const timeoutRef = useRef<number | null>(null);
    const warningTimeoutRef = useRef<number | null>(null);
    const countdownIntervalRef = useRef<number | null>(null);

    const clearAllTimers = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (warningTimeoutRef.current) {
            clearTimeout(warningTimeoutRef.current);
            warningTimeoutRef.current = null;
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
    }, []);

    const startCountdown = useCallback(() => {
        const warningTime = warningDuration / 1000; // Convert to seconds
        setRemainingSeconds(Math.floor(warningTime));

        countdownIntervalRef.current = setInterval(() => {
            setRemainingSeconds((prev) => {
                if (prev <= 1) {
                    if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [warningDuration]);

    const resetTimeout = useCallback(() => {
        clearAllTimers();
        setShowWarning(false);
        setRemainingSeconds(0);

        // Set warning timeout
        warningTimeoutRef.current = setTimeout(() => {
            setShowWarning(true);
            startCountdown();
        }, timeoutDuration - warningDuration);

        // Set logout timeout
        timeoutRef.current = setTimeout(() => {
            onLogout();
        }, timeoutDuration);
    }, [clearAllTimers, onLogout, startCountdown, timeoutDuration, warningDuration]);

    useEffect(() => {
        // Activity events that should reset the timeout
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

        const handleActivity = () => {
            if (!showWarning) {
                resetTimeout();
            }
        };

        // Add event listeners
        activityEvents.forEach((event) => {
            window.addEventListener(event, handleActivity);
        });

        // Start initial timeout
        resetTimeout();

        // Cleanup
        return () => {
            activityEvents.forEach((event) => {
                window.removeEventListener(event, handleActivity);
            });
            clearAllTimers();
        };
    }, [resetTimeout, showWarning, clearAllTimers]);

    return {
        showWarning,
        remainingSeconds,
        resetTimeout,
    };
};
