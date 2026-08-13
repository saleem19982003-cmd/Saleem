// =============================================================
// Auth Routes - Register, Login, Profile
// =============================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { sanitizeHtml, isValidEmail, isValidLength } = require('../middleware/sanitize');

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { email, password, name, nationality, preferred_language } = req.body;

        // Validation
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ error: 'Valid email is required.' });
        }
        if (!password || !isValidLength(password, 6, 128)) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        if (!name || !isValidLength(name, 1, 100)) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        // Check existing user
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // Create user
        const id = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);
        const cleanName = sanitizeHtml(name);
        const cleanNationality = sanitizeHtml(nationality || 'Other');
        const lang = (preferred_language || 'en').substring(0, 5);

        db.prepare(`
            INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role)
            VALUES (?, ?, ?, ?, ?, ?, 'user')
        `).run(id, email.toLowerCase().trim(), passwordHash, cleanName, cleanNationality, lang);

        // Create initial streak record
        db.prepare(`
            INSERT INTO user_streaks (id, user_id) VALUES (?, ?)
        `).run(uuidv4(), id);

        // Track analytics
        db.prepare(`
            INSERT INTO analytics_events (user_id, event_type, event_data)
            VALUES (?, 'user_registered', ?)
        `).run(id, JSON.stringify({ nationality: cleanNationality, language: lang }));

        const user = db.prepare('SELECT id, email, name, nationality, preferred_language, role, created_at FROM users WHERE id = ?').get(id);
        const token = generateToken(user);

        res.status(201).json({ user, token });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const db = req.app.locals.db;
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Update last login
        db.prepare('UPDATE users SET last_login_at = datetime("now") WHERE id = ?').run(user.id);

        const token = generateToken(user);
        const { password_hash, ...safeUser } = user;

        res.json({ user: safeUser, token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const user = db.prepare('SELECT id, email, name, nationality, preferred_language, role, onboarding_completed, onboarding_preferences, created_at, last_login_at FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Get streak data
        const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);

        res.json({ user, streak: streak || {} });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ error: 'Failed to load profile.' });
    }
});

// PUT /api/auth/profile - Update profile
router.put('/profile', authenticateToken, (req, res) => {
    try {
        const db = req.app.locals.db;
        const { name, nationality, preferred_language, onboarding_completed, onboarding_preferences } = req.body;

        const updates = [];
        const params = [];

        if (name && isValidLength(name, 1, 100)) {
            updates.push('name = ?');
            params.push(sanitizeHtml(name));
        }
        if (nationality) {
            updates.push('nationality = ?');
            params.push(sanitizeHtml(nationality));
        }
        if (preferred_language) {
            updates.push('preferred_language = ?');
            params.push(preferred_language.substring(0, 5));
        }
        if (onboarding_completed !== undefined) {
            updates.push('onboarding_completed = ?');
            params.push(onboarding_completed ? 1 : 0);
        }
        if (onboarding_preferences) {
            updates.push('onboarding_preferences = ?');
            params.push(JSON.stringify(onboarding_preferences));
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update.' });
        }

        updates.push('updated_at = datetime("now")');
        params.push(req.user.id);

        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

        const user = db.prepare('SELECT id, email, name, nationality, preferred_language, role, onboarding_completed, onboarding_preferences FROM users WHERE id = ?').get(req.user.id);

        if (onboarding_completed) {
            db.prepare(`
                INSERT INTO analytics_events (user_id, event_type) VALUES (?, 'onboarding_completed')
            `).run(req.user.id);
        }

        res.json({ user });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

module.exports = router;
