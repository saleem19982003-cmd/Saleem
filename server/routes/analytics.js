// =============================================================
// Analytics Routes
// =============================================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// POST /api/analytics/track - Track an analytics event
router.post('/track', optionalAuth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        const { event_type, event_data } = req.body;

        if (!event_type) {
            return res.status(400).json({ error: 'Event type is required.' });
        }

        const validEvents = [
            'user_registered', 'onboarding_completed', 'lesson_started', 'lesson_completed',
            'quiz_completed', 'resource_viewed', 'resource_saved', 'event_viewed',
            'event_registered', 'ai_message_sent', 'voice_practice_started',
            'voice_practice_completed', 'translation_made', 'page_view'
        ];

        if (!validEvents.includes(event_type)) {
            return res.status(400).json({ error: 'Invalid event type.' });
        }

        if (durableDb) await durableDb.recordAnalytics(req.user?.id || null, event_type, event_data || {});
        else db.prepare('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, ?, ?)').run(req.user?.id || null, event_type, JSON.stringify(event_data || {}));

        res.json({ tracked: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to track event.' });
    }
});

module.exports = router;
