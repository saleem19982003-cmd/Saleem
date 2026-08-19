// =============================================================
// JWT Authentication Middleware
// =============================================================
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_AUTHORIZED_EMAIL = 'saleem19982003@gmail.com';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not configured; public read routes remain available, authentication is disabled.');
}

function generateToken(user) {
    if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured.');
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

function authenticateToken(req, res, next) {
    if (!JWT_SECRET) {
        return res.status(503).json({ error: 'Authentication is temporarily unavailable until JWT_SECRET is configured.' });
    }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

// Optional auth - allows unauthenticated access but attaches user if token present
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token && JWT_SECRET) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (err) {
            // Token invalid, continue without user
        }
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user || (req.user.role !== 'admin' && req.user.email !== ADMIN_AUTHORIZED_EMAIL)) {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

function requireAdminEmail(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Admin authentication required.' });
    }

    let decoded = null;

    // 1. Try SUPABASE_JWT_SECRET or JWT_SECRET or SUPABASE_ANON_KEY
    const secrets = [process.env.SUPABASE_JWT_SECRET, JWT_SECRET, process.env.SUPABASE_ANON_KEY].filter(Boolean);
    for (const secret of secrets) {
        try {
            decoded = jwt.verify(token, secret);
            if (decoded) break;
        } catch (e) {}
    }

    // 2. Fallback decode if token is from Supabase Auth provider
    if (!decoded) {
        try {
            decoded = jwt.decode(token);
        } catch (e) {}
    }

    if (!decoded || (!decoded.email && !decoded.user_metadata?.email)) {
        return res.status(401).json({ error: 'Invalid or expired administrator token.' });
    }

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        return res.status(401).json({ error: 'Expired administrator token.' });
    }

    const email = (decoded.email || decoded.user_metadata?.email || '').toLowerCase().trim();
    if (email !== ADMIN_AUTHORIZED_EMAIL) {
        return res.status(403).json({ error: 'Forbidden: Access restricted strictly to authorized administrator.' });
    }

    req.user = {
        id: decoded.sub || decoded.id,
        email: email,
        role: 'admin',
        name: decoded.user_metadata?.name || 'Saleem Admin'
    };
    next();
}

function requireModeratorOrAdmin(req, res, next) {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'moderator' && req.user.email !== ADMIN_AUTHORIZED_EMAIL)) {
        return res.status(403).json({ error: 'Moderator or admin access required.' });
    }
    next();
}

module.exports = {
    generateToken,
    authenticateToken,
    optionalAuth,
    requireAdmin,
    requireAdminEmail,
    requireModeratorOrAdmin,
    ADMIN_AUTHORIZED_EMAIL,
    JWT_SECRET
};
