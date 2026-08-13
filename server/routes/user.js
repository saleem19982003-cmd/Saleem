// =============================================================
// User Routes - Profile, progress, saved items
// =============================================================
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// GET /api/user/progress - Get all learning progress
router.get('/progress', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const progress = db.prepare(`
            SELECT up.*, l.title_en as lesson_title, l.difficulty, lc.name_en as category_name, lc.icon as category_icon
            FROM user_progress up
            JOIN lessons l ON up.lesson_id = l.id
            JOIN lesson_categories lc ON l.category_id = lc.id
            WHERE up.user_id = ?
            ORDER BY up.started_at DESC
        `).all(req.user.id);

        const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);

        res.json({ progress, streak: streak || {} });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load progress.' });
    }
});

// GET /api/user/saved-resources
router.get('/saved-resources', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const saved = db.prepare(`
            SELECT r.*, sr.saved_at
            FROM saved_resources sr
            JOIN resources r ON sr.resource_id = r.id
            WHERE sr.user_id = ?
            ORDER BY sr.saved_at DESC
        `).all(req.user.id);

        saved.forEach(r => {
            try { r.required_documents = JSON.parse(r.required_documents || '[]'); } catch(e) { r.required_documents = []; }
        });

        res.json({ resources: saved });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load saved resources.' });
    }
});

// GET /api/user/registered-events
router.get('/registered-events', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const events = db.prepare(`
            SELECT e.*, er.registered_at
            FROM event_registrations er
            JOIN events e ON er.event_id = e.id
            WHERE er.user_id = ?
            ORDER BY e.date ASC
        `).all(req.user.id);

        res.json({ events });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load registered events.' });
    }
});

// GET /api/user/stats
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);
        const completedLessons = db.prepare("SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND status = 'completed'").get(req.user.id);
        const savedResources = db.prepare('SELECT COUNT(*) as count FROM saved_resources WHERE user_id = ?').get(req.user.id);
        const registeredEvents = db.prepare('SELECT COUNT(*) as count FROM event_registrations WHERE user_id = ?').get(req.user.id);
        const chatMessages = db.prepare(`
            SELECT COUNT(*) as count FROM chat_messages cm
            JOIN chat_conversations cc ON cm.conversation_id = cc.id
            WHERE cc.user_id = ? AND cm.role = 'user'
        `).get(req.user.id);

        res.json({
            streak: streak || { current_streak: 0, total_lessons_completed: 0, total_words_learned: 0, xp_points: 0, level: 'beginner' },
            completed_lessons: completedLessons.count,
            saved_resources: savedResources.count,
            registered_events: registeredEvents.count,
            ai_messages_sent: chatMessages.count,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load stats.' });
    }
});

module.exports = router;
