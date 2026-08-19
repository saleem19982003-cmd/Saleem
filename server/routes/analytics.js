// =============================================================
// Analytics Tracking Routes
// Real-time, privacy-safe analytics pipeline for Saleem Web & Android
// =============================================================
const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');

// Sanitizer to strip sensitive credentials and tokens
const SENSITIVE_KEYS = [
    'password', 'password_hash', 'token', 'access_token', 'refresh_token',
    'auth', 'authorization', 'secret', 'api_key', 'service_role', 'service_key'
];

function sanitizeMetadata(data) {
    if (!data || typeof data !== 'object') return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.some(s => lowerKey.includes(s))) {
            continue; // Exclude sensitive field entirely
        }
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            sanitized[key] = sanitizeMetadata(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

// POST /api/analytics/track - Ingest analytics events
router.post('/track', optionalAuth, async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        const {
            event_name,
            event_type,
            event_category = 'general',
            session_id,
            anonymous_id,
            page_or_screen,
            lesson_id,
            quiz_id,
            metadata = {},
            event_data = {},
            platform = 'web'
        } = req.body;

        const eventType = event_name || event_type;
        if (!eventType) {
            return res.status(400).json({ error: 'Event name/type is required.' });
        }

        const userId = req.user?.id || req.body.user_id || null;
        const cleanMetadata = sanitizeMetadata({ ...event_data, ...metadata });

        // Record in durable PostgreSQL if configured
        if (durableDb && typeof durableDb.recordAnalyticsEventDetailed === 'function') {
            await durableDb.recordAnalyticsEventDetailed({
                userId,
                anonymousId: anonymous_id || null,
                sessionId: session_id || null,
                eventType,
                category: event_category,
                page: page_or_screen || null,
                lessonId: lesson_id ? parseInt(lesson_id, 10) : null,
                quizId: quiz_id || null,
                metadata: cleanMetadata
            });
        }

        // SQLite local storage
        if (db) {
            try {
                // Ensure event in analytics_events
                db.prepare(`
                    INSERT INTO analytics_events (user_id, anonymous_id, session_id, event_type, event_category, page_or_screen, lesson_id, quiz_id, event_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    userId,
                    anonymous_id || null,
                    session_id || null,
                    eventType,
                    event_category,
                    page_or_screen || null,
                    lesson_id ? parseInt(lesson_id, 10) : null,
                    quiz_id || null,
                    JSON.stringify(cleanMetadata)
                );

                // Upsert session heartbeat in SQLite
                if (session_id) {
                    const existingSess = db.prepare('SELECT id FROM analytics_sessions WHERE id = ?').get(session_id);
                    if (existingSess) {
                        db.prepare("UPDATE analytics_sessions SET last_activity_at = datetime('now') WHERE id = ?").run(session_id);
                    } else {
                        db.prepare(`
                            INSERT INTO analytics_sessions (id, user_id, anonymous_id, platform, started_at, last_activity_at)
                            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                        `).run(session_id, userId, anonymous_id || null, platform);
                    }
                }
            } catch (sqlErr) {
                console.warn('[Analytics SQLite] Ingestion notice:', sqlErr?.message || sqlErr);
            }
        }

        res.json({ tracked: true });
    } catch (err) {
        console.warn('[Analytics Route] Error:', err?.message || err);
        // Fail-safe: Always return 200/tracked to never break client app
        res.json({ tracked: true, fallback: true });
    }
});

// POST /api/analytics/heartbeat - Periodic online presence heartbeat
router.post('/heartbeat', optionalAuth, async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        const {
            session_id,
            anonymous_id,
            duration_seconds = 0,
            platform = 'web'
        } = req.body;

        const userId = req.user?.id || req.body.user_id || null;

        if (durableDb && typeof durableDb.recordSessionHeartbeat === 'function') {
            await durableDb.recordSessionHeartbeat({
                sessionId: session_id,
                userId,
                anonymousId: anonymous_id,
                platform,
                durationSeconds: Math.min(Math.max(0, parseInt(duration_seconds, 10) || 0), 86400)
            });
        }

        if (db && session_id) {
            try {
                const existing = db.prepare('SELECT id FROM analytics_sessions WHERE id = ?').get(session_id);
                if (existing) {
                    db.prepare(`
                        UPDATE analytics_sessions
                        SET duration_seconds = MAX(duration_seconds, ?),
                            last_activity_at = datetime('now')
                        WHERE id = ?
                    `).run(parseInt(duration_seconds, 10) || 0, session_id);
                } else {
                    db.prepare(`
                        INSERT INTO analytics_sessions (id, user_id, anonymous_id, platform, started_at, duration_seconds, last_activity_at)
                        VALUES (?, ?, ?, ?, datetime('now'), ?, datetime('now'))
                    `).run(session_id, userId, anonymous_id || null, platform, parseInt(duration_seconds, 10) || 0);
                }
            } catch (e) {}
        }

        res.json({ ok: true });
    } catch (err) {
        res.json({ ok: true, fallback: true });
    }
});

module.exports = router;
