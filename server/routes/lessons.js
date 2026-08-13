// =============================================================
// Lessons Routes - Learning content, vocabulary, quizzes
// =============================================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// GET /api/lessons/categories - Get all lesson categories
router.get('/categories', (req, res) => {
    try {
        const db = req.app.locals.db;
        const categories = db.prepare('SELECT * FROM lesson_categories WHERE is_active = 1 ORDER BY sort_order').all();
        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load categories.' });
    }
});

// GET /api/lessons - Get all lessons (with optional category filter)
router.get('/', optionalAuth, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { category, difficulty } = req.query;

        let query = 'SELECT l.*, lc.name_en as category_name, lc.icon as category_icon FROM lessons l JOIN lesson_categories lc ON l.category_id = lc.id WHERE l.is_active = 1';
        const params = [];

        if (category) {
            query += ' AND l.category_id = ?';
            params.push(category);
        }
        if (difficulty) {
            query += ' AND l.difficulty = ?';
            params.push(difficulty);
        }

        query += ' ORDER BY lc.sort_order, l.sort_order';

        const lessons = db.prepare(query).all(...params);

        // If user is authenticated, attach progress
        if (req.user) {
            const progress = db.prepare('SELECT lesson_id, status, score, completed_at FROM user_progress WHERE user_id = ?').all(req.user.id);
            const progressMap = {};
            progress.forEach(p => { progressMap[p.lesson_id] = p; });
            lessons.forEach(l => { l.progress = progressMap[l.id] || null; });
        }

        res.json({ lessons });
    } catch (err) {
        console.error('Lessons fetch error:', err);
        res.status(500).json({ error: 'Failed to load lessons.' });
    }
});

// GET /api/lessons/:id - Get single lesson with content
router.get('/:id', optionalAuth, (req, res) => {
    try {
        const db = req.app.locals.db;
        const lesson = db.prepare('SELECT l.*, lc.name_en as category_name FROM lessons l JOIN lesson_categories lc ON l.category_id = lc.id WHERE l.id = ?').get(req.params.id);

        if (!lesson) {
            return res.status(404).json({ error: 'Lesson not found.' });
        }

        // Parse content JSON
        lesson.content = JSON.parse(lesson.content_json || '{}');

        // Get quiz questions
        const quizzes = db.prepare('SELECT * FROM quiz_questions WHERE lesson_id = ? ORDER BY sort_order').all(req.params.id);
        quizzes.forEach(q => { q.options = JSON.parse(q.options_json || '[]'); });

        // Get vocabulary
        const vocabulary = db.prepare('SELECT * FROM vocabulary WHERE lesson_id = ?').all(req.params.id);

        // Get user progress if authenticated
        let progress = null;
        if (req.user) {
            progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?').get(req.user.id, req.params.id);
        }

        res.json({ lesson, quizzes, vocabulary, progress });
    } catch (err) {
        console.error('Lesson fetch error:', err);
        res.status(500).json({ error: 'Failed to load lesson.' });
    }
});

// POST /api/lessons/:id/start - Start a lesson
router.post('/:id/start', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const lessonId = req.params.id;
        const userId = req.user.id;

        // Check if progress exists
        const existing = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId);

        if (existing) {
            if (existing.status === 'not_started') {
                db.prepare("UPDATE user_progress SET status = 'in_progress', started_at = datetime('now') WHERE id = ?").run(existing.id);
            }
        } else {
            db.prepare("INSERT INTO user_progress (id, user_id, lesson_id, status) VALUES (?, ?, ?, 'in_progress')").run(uuidv4(), userId, lessonId);
        }

        // Track analytics
        db.prepare('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, "lesson_started", ?)').run(userId, JSON.stringify({ lesson_id: lessonId }));

        res.json({ message: 'Lesson started.' });
    } catch (err) {
        console.error('Lesson start error:', err);
        res.status(500).json({ error: 'Failed to start lesson.' });
    }
});

// POST /api/lessons/:id/complete - Complete a lesson with quiz score
router.post('/:id/complete', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const lessonId = req.params.id;
        const userId = req.user.id;
        const { score } = req.body;

        const existing = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId);

        if (existing) {
            db.prepare("UPDATE user_progress SET status = 'completed', score = ?, completed_at = datetime('now') WHERE id = ?").run(score || 0, existing.id);
        } else {
            db.prepare("INSERT INTO user_progress (id, user_id, lesson_id, status, score, completed_at) VALUES (?, ?, ?, 'completed', ?, datetime('now'))").run(uuidv4(), userId, lessonId, score || 0);
        }

        // Update streak
        const today = new Date().toISOString().split('T')[0];
        const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(userId);

        if (streak) {
            let newStreak = streak.current_streak;
            if (streak.last_activity_date !== today) {
                const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                if (streak.last_activity_date === yesterday) {
                    newStreak = streak.current_streak + 1;
                } else {
                    newStreak = 1;
                }
            }

            const longestStreak = Math.max(newStreak, streak.longest_streak);
            db.prepare(`
                UPDATE user_streaks SET
                    current_streak = ?,
                    longest_streak = ?,
                    last_activity_date = ?,
                    total_lessons_completed = total_lessons_completed + 1,
                    xp_points = xp_points + ?
                WHERE user_id = ?
            `).run(newStreak, longestStreak, today, (score || 0) + 10, userId);
        }

        // Track analytics
        db.prepare('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, "lesson_completed", ?)').run(userId, JSON.stringify({ lesson_id: lessonId, score }));

        res.json({ message: 'Lesson completed!', score });
    } catch (err) {
        console.error('Lesson complete error:', err);
        res.status(500).json({ error: 'Failed to complete lesson.' });
    }
});

module.exports = router;
