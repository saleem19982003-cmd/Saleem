// =============================================================
// Community Routes - Posts, replies, reviews
// =============================================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { sanitizeHtml, isValidLength } = require('../middleware/sanitize');

// GET /api/community/posts
router.get('/posts', optionalAuth, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { category, page = 1, limit = 20 } = req.query;

        const includeDemo = req.query.include_demo === '1' || req.query.include_demo === 'true';
        let query = 'SELECT * FROM community_posts WHERE 1=1';
        const params = [];

        if (!includeDemo) {
            query += ' AND is_demo_data = 0';
        }

        if (category && category !== 'all') {
            query += ' AND category = ?';
            params.push(category);
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ' ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const posts = db.prepare(query).all(...params);

        // Attach replies
        posts.forEach(post => {
            post.replies = db.prepare('SELECT * FROM post_replies WHERE post_id = ? ORDER BY created_at ASC').all(post.id);
        });

        res.json({ posts });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load community posts.' });
    }
});

// POST /api/community/posts
router.post('/posts', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, body, category } = req.body;

        if (!title || !isValidLength(title, 3, 200)) {
            return res.status(400).json({ error: 'Title must be 3-200 characters.' });
        }

        const user = db.prepare('SELECT name, nationality FROM users WHERE id = ?').get(req.user.id);
        const id = uuidv4();

        db.prepare(`
            INSERT INTO community_posts (id, author_id, author_name, author_nationality, title, body, category)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, req.user.id, user.name, user.nationality, sanitizeHtml(title), sanitizeHtml(body || title), category || 'general');

        const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(id);
        post.replies = [];
        res.status(201).json({ post });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create post.' });
    }
});

// POST /api/community/posts/:id/reply
router.post('/posts/:id/reply', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { body } = req.body;

        if (!body || !isValidLength(body, 1, 2000)) {
            return res.status(400).json({ error: 'Reply text is required.' });
        }

        const post = db.prepare('SELECT id FROM community_posts WHERE id = ?').get(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found.' });

        const user = db.prepare('SELECT name, nationality FROM users WHERE id = ?').get(req.user.id);
        const id = uuidv4();

        db.prepare(`
            INSERT INTO post_replies (id, post_id, author_id, author_name, author_nationality, body)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, req.params.id, req.user.id, user.name, user.nationality, sanitizeHtml(body));

        const reply = db.prepare('SELECT * FROM post_replies WHERE id = ?').get(id);
        res.status(201).json({ reply });
    } catch (err) {
        res.status(500).json({ error: 'Failed to submit reply.' });
    }
});

// GET /api/community/reviews
router.get('/reviews', (req, res) => {
    try {
        const db = req.app.locals.db;
        const reviews = db.prepare('SELECT * FROM reviews WHERE is_demo_data = 0 ORDER BY created_at DESC LIMIT 50').all();
        const total = db.prepare('SELECT COUNT(*) as count, AVG(rating) as avg_rating FROM reviews WHERE is_demo_data = 0').get();

        res.json({ reviews, total_count: total.count, average_rating: total.avg_rating ? parseFloat(total.avg_rating.toFixed(1)) : 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load reviews.' });
    }
});

// POST /api/community/reviews
router.post('/reviews', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { rating, help_text, improvement_text } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Rating must be 1-5.' });
        }
        if (!help_text || !isValidLength(help_text, 5, 1000)) {
            return res.status(400).json({ error: 'Please describe how Saleem helped you (5+ characters).' });
        }

        const user = db.prepare('SELECT name, nationality FROM users WHERE id = ?').get(req.user.id);
        const id = uuidv4();

        db.prepare(`
            INSERT INTO reviews (id, author_id, author_name, author_nationality, rating, help_text, improvement_text)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, req.user.id, user.name, user.nationality, rating, sanitizeHtml(help_text), sanitizeHtml(improvement_text || ''));

        const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
        res.status(201).json({ review });
    } catch (err) {
        res.status(500).json({ error: 'Failed to submit review.' });
    }
});

module.exports = router;
