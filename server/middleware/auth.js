// =============================================================
// JWT Authentication Middleware
// =============================================================
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '';

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
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
}

function requireModeratorOrAdmin(req, res, next) {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'moderator')) {
        return res.status(403).json({ error: 'Moderator or admin access required.' });
    }
    next();
}

module.exports = { generateToken, authenticateToken, optionalAuth, requireAdmin, requireModeratorOrAdmin, JWT_SECRET };
