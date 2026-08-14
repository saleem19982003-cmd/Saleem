// =============================================================
// Events Routes
// =============================================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');
const { sanitizeHtml } = require('../middleware/sanitize');

// GET /api/events
router.get('/', optionalAuth, async (req, res) => {
    try {
        const db = req.app.locals.contentDb || req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        const { category, status } = req.query;
        let query = 'SELECT * FROM events WHERE 1=1';
        const params = [];

        if (category) { query += ' AND category = ?'; params.push(category); }
        if (status) { query += ' AND status = ?'; params.push(status); }

        query += ' ORDER BY date ASC';
        const events = db.prepare(query).all(...params);

        // Attach registration count and user's registration status
        for (const e of events) {
            const count = durableDb ? await durableDb.countEventRegistrations(e.id) : db.prepare('SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ?').get(e.id);
            e.attendee_count = count.count;
            if (req.user) {
                const reg = durableDb ? await durableDb.getEventRegistration(req.user.id, e.id) : db.prepare('SELECT id FROM event_registrations WHERE user_id = ? AND event_id = ?').get(req.user.id, e.id);
                e.is_registered = !!reg;
            }
        }

        res.json({ events });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load events.' });
    }
});

// GET /api/events/:id
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const db = req.app.locals.contentDb || req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
        if (!event) return res.status(404).json({ error: 'Event not found.' });

        const count = durableDb ? await durableDb.countEventRegistrations(event.id) : db.prepare('SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ?').get(event.id);
        event.attendee_count = count.count;

        if (req.user) {
            const reg = durableDb ? await durableDb.getEventRegistration(req.user.id, event.id) : db.prepare('SELECT id FROM event_registrations WHERE user_id = ? AND event_id = ?').get(req.user.id, event.id);
            event.is_registered = !!reg;
            if (durableDb) await durableDb.recordAnalytics(req.user.id, 'event_viewed', { event_id: event.id });
            else db.prepare("INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, 'event_viewed', ?)").run(req.user.id, JSON.stringify({ event_id: event.id }));
        }

        res.json({ event });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load event.' });
    }
});

// POST /api/events/:id/register
router.post('/:id/register', authenticateToken, async (req, res) => {
    try {
        const db = req.app.locals.contentDb || req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
        if (!event) return res.status(404).json({ error: 'Event not found.' });

        const existing = durableDb ? await durableDb.getEventRegistration(req.user.id, req.params.id) : db.prepare('SELECT id FROM event_registrations WHERE user_id = ? AND event_id = ?').get(req.user.id, req.params.id);
        if (existing) {
            if (durableDb) await durableDb.removeEventRegistration(existing.id);
            else db.prepare('DELETE FROM event_registrations WHERE id = ?').run(existing.id);
            return res.json({ registered: false, message: 'Registration cancelled.' });
        }

        if (event.max_attendees) {
            const count = durableDb ? await durableDb.countEventRegistrations(req.params.id) : db.prepare('SELECT COUNT(*) as count FROM event_registrations WHERE event_id = ?').get(req.params.id);
            if (count.count >= event.max_attendees) {
                return res.status(400).json({ error: 'Event is full.' });
            }
        }

        if (durableDb) {
            await durableDb.registerEvent(req.user.id, req.params.id, uuidv4());
            await durableDb.recordAnalytics(req.user.id, 'event_registered', { event_id: req.params.id });
        } else {
            db.prepare('INSERT INTO event_registrations (id, user_id, event_id) VALUES (?, ?, ?)').run(uuidv4(), req.user.id, req.params.id);
            db.prepare("INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, 'event_registered', ?)").run(req.user.id, JSON.stringify({ event_id: req.params.id }));
        }

        res.json({ registered: true, message: 'Registered successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to register for event.' });
    }
});

// POST /api/events - Create event (admin)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, description, category, location, address, date, time, duration_minutes, max_attendees } = req.body;

        if (!title || !date) return res.status(400).json({ error: 'Title and date are required.' });

        const id = uuidv4();
        db.prepare(`
            INSERT INTO events (id, title, description, category, location, address, date, time, duration_minutes, max_attendees, organizer_id, organizer_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, sanitizeHtml(title), sanitizeHtml(description), category || 'general', location, address, date, time, duration_minutes, max_attendees, req.user.id, req.user.name);

        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
        res.status(201).json({ event });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create event.' });
    }
});

module.exports = router;
