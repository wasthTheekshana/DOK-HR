import rateLimit from 'express-rate-limit';

// Strict limiter for login — 5 failed attempts per 5 minutes per IP
export const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again after 5 minutes.' },
});

// General API limiter — 120 requests per minute per IP
export const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests. Please slow down.' },
});

// Heavy endpoints (payroll calc, reports, invoice preview) — 30 per minute per IP
export const heavyLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Rate limit exceeded for this endpoint. Please wait a moment.' },
});
