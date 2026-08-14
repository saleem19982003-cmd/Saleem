// =============================================================
// Admin Routes - Dashboard, user management, content management
// =============================================================
const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/admin/dashboard - Overview stats
router.get('/dashboard', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;

        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const activeToday = db.prepare("SELECT COUNT(*) as count FROM users WHERE last_login_at >= date('now')").get();
        const activeWeek = db.prepare("SELECT COUNT(*) as count FROM users WHERE last_login_at >= date('now', '-7 days')").get();
        const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons WHERE is_active = 1').get();
        const totalResources = db.prepare('SELECT COUNT(*) as count FROM resources').get();
        const verifiedResources = db.prepare("SELECT COUNT(*) as count FROM resources WHERE verification_status = 'verified'").get();
        const pendingResources = db.prepare("SELECT COUNT(*) as count FROM resources WHERE verification_status = 'pending'").get();
        const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
        const totalPosts = db.prepare('SELECT COUNT(*) as count FROM community_posts').get();
        const totalReviews = db.prepare('SELECT COUNT(*) as count FROM reviews').get();
        const avgRating = db.prepare('SELECT AVG(rating) as avg FROM reviews').get();
        const totalAiMessages = db.prepare("SELECT COUNT(*) as count FROM chat_messages WHERE role = 'user'").get();
        const lessonsCompleted = db.prepare("SELECT COUNT(*) as count FROM user_progress WHERE status = 'completed'").get();

        // Recent analytics events
        const recentEvents = db.prepare(`
            SELECT event_type, COUNT(*) as count
            FROM analytics_events
            WHERE created_at >= date('now', '-7 days')
            GROUP BY event_type
            ORDER BY count DESC
        `).all();

        // User nationality distribution
        const nationalityDist = db.prepare(`
            SELECT nationality, COUNT(*) as count FROM users
            WHERE role = 'user'
            GROUP BY nationality ORDER BY count DESC
        `).all();

        res.json({
            users: { total: totalUsers.count, active_today: activeToday.count, active_week: activeWeek.count },
            content: { lessons: totalLessons.count, resources_total: totalResources.count, resources_verified: verifiedResources.count, resources_pending: pendingResources.count },
            community: { events: totalEvents.count, posts: totalPosts.count, reviews: totalReviews.count, avg_rating: avgRating.avg ? parseFloat(avgRating.avg.toFixed(1)) : 0 },
            ai: { total_messages: totalAiMessages.count },
            learning: { lessons_completed: lessonsCompleted.count },
            recent_analytics: recentEvents,
            nationality_distribution: nationalityDist,
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard.' });
    }
});

// GET /api/admin/users - List all users
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { page = 1, limit = 50, search } = req.query;

        let query = 'SELECT id, email, name, nationality, preferred_language, role, onboarding_completed, created_at, last_login_at, is_active FROM users WHERE 1=1';
        const params = [];

        if (search) {
            query += ' AND (name LIKE ? OR email LIKE ? OR nationality LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const users = db.prepare(query).all(...params);
        const total = db.prepare('SELECT COUNT(*) as count FROM users').get();

        res.json({ users, total: total.count });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load users.' });
    }
});

// PUT /api/admin/users/:id/role - Update user role
router.put('/users/:id/role', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { role } = req.body;
        if (!['user', 'admin', 'moderator'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role.' });
        }
        db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, req.params.id);
        res.json({ message: 'User role updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update role.' });
    }
});

// PUT /api/admin/users/:id/status - Activate/deactivate user
router.put('/users/:id/status', authenticateToken, requireAdmin, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { is_active } = req.body;
        db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(is_active ? 1 : 0, req.params.id);
        res.json({ message: is_active ? 'User activated.' : 'User deactivated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update user status.' });
    }
});

module.exports = router;
