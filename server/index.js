// =============================================================
// SALEEM Production Server
// Express.js backend with SQLite, JWT auth, AI proxy, rate limiting
// =============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const os = require('os');
const { initializeDatabase, seedDatabase } = require('./database');
const { createPostgresStore, hasPostgresConfig } = require('./postgres');

const app = express();
const PORT = process.env.PORT || 3000;
// Vercel forwards the client address through X-Forwarded-For; trust the
// single platform proxy so rate limiting uses the real client boundary.
app.set('trust proxy', 1);

// Initialize database
const isVercelRuntime = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
// Vercel's deployed bundle is immutable. Keep the existing local path for
// development, but use its writable ephemeral directory in serverless runs.
const dbPath = isVercelRuntime ? path.join(os.tmpdir(), 'saleem-content.db') : (process.env.DATABASE_PATH || './data/saleem.db');
const db = initializeDatabase(path.resolve(__dirname, '..', dbPath));
seedDatabase(db, { contentOnly: isVercelRuntime && hasPostgresConfig() });
const userDb = createPostgresStore();

// The SQLite database is content-only in production. Durable user-owned data
// uses the server-side Supabase PostgreSQL store when configured.
app.locals.db = db;
app.locals.contentDb = db;
app.locals.userDb = userDb;
app.locals.hasPostgresConfig = hasPostgresConfig();

// =============================================================
// MIDDLEWARE
// =============================================================

// Security headers
app.use(helmet({
    contentSecurityPolicy: false, // We serve inline scripts
    crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// General rate limiting
const generalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', generalLimiter);

// AI-specific rate limiting (more restrictive)
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.AI_RATE_LIMIT_MAX) || 30,
    message: { error: 'AI rate limit reached. Please wait a few minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/ai/', aiLimiter);

// Request logging
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
});

// =============================================================
// ROUTES
// =============================================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/events', require('./routes/events'));
app.use('/api/community', require('./routes/community'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/tts', require('./routes/tts'));

app.get('/api/health', async (req, res) => {
    let postgresReady = false;
    if (userDb) {
        try { await userDb.ready(); postgresReady = true; } catch (error) { console.error('PostgreSQL readiness check failed:', error.message); }
    }
    res.status(userDb && !postgresReady ? 503 : 200).json({
        status: 'ok',
        database: postgresReady ? 'ready' : (userDb ? 'unavailable' : 'not-configured'),
        database_mode: postgresReady ? 'supabase-postgres' : (isVercelRuntime ? 'content-only-sqlite' : 'local'),
        jwt_secret_configured: Boolean(process.env.JWT_SECRET),
        ai_key_configured: Boolean(process.env.GROQ_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY)
    });
});

// =============================================================
// STATIC FILES - Serve the frontend
// =============================================================
app.use(express.static(path.join(__dirname, '..'), {
    index: false,
    extensions: ['html'],
}));

// Serve app.html for /app route
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'app.html'));
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// =============================================================
// ERROR HANDLING
// =============================================================
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`, err.stack);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'An internal server error occurred.'
            : err.message,
    });
});

// 404 handler
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found.' });
    }
    res.status(404).sendFile(path.join(__dirname, '..', 'index.html'));
});

// =============================================================
// START SERVER
// =============================================================
if (require.main === module) app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║        🌍 SALEEM Server Running                  ║
║        Port: ${PORT}                               ║
║        ENV: ${process.env.NODE_ENV || 'development'}                    ║
║        DB: ${dbPath}                  ║
║        http://localhost:${PORT}                      ║
╚══════════════════════════════════════════════════╝
    `);
});

module.exports = app;
