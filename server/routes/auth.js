// =============================================================
// Auth Routes - Register, Login, Profile
// =============================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { generateToken, authenticateToken } = require('../middleware/auth');
const { sanitizeHtml, isValidEmail, isValidLength } = require('../middleware/sanitize');
const SUPPORTED_LANGUAGE_CODES = new Set(['en', 'ar', 'am', 'so', 'fr', 'ti', 'sw', 'ha', 'om']);

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const durableDb = req.app.locals.userDb;
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
        const normalizedEmail = email.toLowerCase().trim();
        const existing = durableDb
            ? await durableDb.getUserByEmail(normalizedEmail)
            : db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        // Create user
        const id = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);
        const cleanName = sanitizeHtml(name);
        const cleanNationality = sanitizeHtml(nationality || 'Other');
        const requestedLanguage = String(preferred_language || 'en').substring(0, 5);
        const lang = SUPPORTED_LANGUAGE_CODES.has(requestedLanguage) ? requestedLanguage : 'en';

        let user;
        if (durableDb) {
            user = await durableDb.createUser({ id, email: normalizedEmail, password_hash: passwordHash, name: cleanName, nationality: cleanNationality, preferred_language: lang }, uuidv4(), { nationality: cleanNationality, language: lang });
        } else {
            db.prepare(`
                INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role)
                VALUES (?, ?, ?, ?, ?, ?, 'user')
            `).run(id, normalizedEmail, passwordHash, cleanName, cleanNationality, lang);
            db.prepare(`INSERT INTO user_streaks (id, user_id) VALUES (?, ?)`).run(uuidv4(), id);
            db.prepare(`INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, 'user_registered', ?)`).run(id, JSON.stringify({ nationality: cleanNationality, language: lang }));
            user = db.prepare('SELECT id, email, name, nationality, preferred_language, role, created_at FROM users WHERE id = ?').get(id);
        }
        const token = generateToken(user);

        res.status(201).json({ user, token });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(err.status || 500).json({ error: err.status === 503 ? 'Persistent database is temporarily unavailable.' : 'Registration failed. Please try again.' });
    }
});

// POST /api/auth/register-anon — Anonymous registration via Supabase Auth UUID
router.post('/register-anon', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        const { supabase_uid, name, nationality, preferred_language } = req.body;

        if (!supabase_uid || !isValidLength(supabase_uid, 10, 128)) {
            return res.status(400).json({ error: 'Valid Supabase UID is required.' });
        }
        if (!name || !isValidLength(name, 1, 100)) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const cleanName = sanitizeHtml(name);
        const cleanNationality = sanitizeHtml(nationality || 'Other');
        const requestedLanguage = String(preferred_language || 'en').substring(0, 5);
        const lang = SUPPORTED_LANGUAGE_CODES.has(requestedLanguage) ? requestedLanguage : 'en';

        let user;
        if (durableDb) {
            user = await durableDb.createAnonymousUser(supabase_uid, cleanName, cleanNationality, lang, uuidv4());
        } else {
            // SQLite fallback for local development
            const syntheticEmail = `${supabase_uid}@anon.saleem.local`;
            const placeholderHash = '$2a$10$ANON_USER_NO_PASSWORD_HASH_PLACEHOLDER00000000000000000';
            const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(supabase_uid);
            if (existing) {
                db.prepare(`UPDATE users SET name = ?, nationality = ?, preferred_language = ?, updated_at = datetime('now') WHERE id = ?`)
                    .run(cleanName, cleanNationality, lang, supabase_uid);
            } else {
                db.prepare(`INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role) VALUES (?, ?, ?, ?, ?, ?, 'user')`)
                    .run(supabase_uid, syntheticEmail, placeholderHash, cleanName, cleanNationality, lang);
                db.prepare(`INSERT INTO user_streaks (id, user_id) VALUES (?, ?)`).run(uuidv4(), supabase_uid);
            }
            db.prepare(`INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, 'anonymous_registration', ?)`)
                .run(supabase_uid, JSON.stringify({ nationality: cleanNationality, language: lang }));
            user = db.prepare('SELECT id, email, name, nationality, preferred_language, role, created_at FROM users WHERE id = ?').get(supabase_uid);
        }

        const token = generateToken(user);
        res.status(201).json({ user, token });
    } catch (err) {
        console.error('Anonymous registration error:', err);
        res.status(err.status || 500).json({ error: err.status === 503 ? 'Persistent database is temporarily unavailable.' : 'Anonymous registration failed.' });
    }
});

// POST /api/auth/migrate-identity — Migrate legacy local ID to Supabase Auth UUID
router.post('/migrate-identity', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        const { old_user_id, new_user_id } = req.body;

        if (!old_user_id || !new_user_id) {
            return res.status(400).json({ error: 'Both old_user_id and new_user_id are required.' });
        }
        if (old_user_id === new_user_id) {
            return res.status(400).json({ error: 'Old and new user IDs must be different.' });
        }

        let user;
        if (durableDb) {
            user = await durableDb.migrateUserIdentity(old_user_id, new_user_id);
        } else {
            // SQLite fallback
            const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(old_user_id);
            if (!oldUser) return res.status(404).json({ error: 'Legacy user not found.' });

            const newEmail = `${new_user_id}@anon.saleem.local`;
            const existingNew = db.prepare('SELECT id FROM users WHERE id = ?').get(new_user_id);

            db.transaction(() => {
                if (!existingNew) {
                    // Create new user record by copying legacy user
                    db.prepare(`
                        INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role, onboarding_completed, onboarding_preferences, avatar_url, created_at, updated_at, last_login_at, is_active)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
                    `).run(
                        new_user_id,
                        newEmail,
                        oldUser.password_hash || '$2a$10$ANON_USER_NO_PASSWORD_HASH_PLACEHOLDER00000000000000000',
                        oldUser.name,
                        oldUser.nationality,
                        oldUser.preferred_language,
                        oldUser.role || 'user',
                        oldUser.onboarding_completed || 0,
                        oldUser.onboarding_preferences || '[]',
                        oldUser.avatar_url || null,
                        oldUser.created_at,
                        oldUser.last_login_at || null,
                        oldUser.is_active !== undefined ? oldUser.is_active : 1
                    );
                } else {
                    // Update profile on existing new user if legacy has more details
                    db.prepare(`
                        UPDATE users SET name = COALESCE(NULLIF(name, ''), ?), nationality = COALESCE(NULLIF(nationality, ''), ?), preferred_language = COALESCE(NULLIF(preferred_language, ''), ?), updated_at = datetime('now')
                        WHERE id = ?
                    `).run(oldUser.name, oldUser.nationality, oldUser.preferred_language, new_user_id);
                }

                // Handle unique conflict tables before moving child records
                // 1. user_streaks (unique user_id)
                const newStreak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(new_user_id);
                const oldStreak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(old_user_id);
                if (newStreak && oldStreak) {
                    const mergedCurrent = Math.max(newStreak.current_streak || 0, oldStreak.current_streak || 0);
                    const mergedLongest = Math.max(newStreak.longest_streak || 0, oldStreak.longest_streak || 0);
                    const mergedWords = (newStreak.total_words_learned || 0) + (oldStreak.total_words_learned || 0);
                    const mergedPhrases = (newStreak.total_phrases_mastered || 0) + (oldStreak.total_phrases_mastered || 0);
                    const mergedLessons = (newStreak.total_lessons_completed || 0) + (oldStreak.total_lessons_completed || 0);
                    const mergedQuizzes = (newStreak.total_quizzes_completed || 0) + (oldStreak.total_quizzes_completed || 0);
                    const mergedXp = (newStreak.xp_points || 0) + (oldStreak.xp_points || 0);
                    db.prepare(`
                        UPDATE user_streaks SET current_streak = ?, longest_streak = ?, total_words_learned = ?, total_phrases_mastered = ?, total_lessons_completed = ?, total_quizzes_completed = ?, xp_points = ?
                        WHERE user_id = ?
                    `).run(mergedCurrent, mergedLongest, mergedWords, mergedPhrases, mergedLessons, mergedQuizzes, mergedXp, new_user_id);
                    db.prepare('DELETE FROM user_streaks WHERE user_id = ?').run(old_user_id);
                } else if (oldStreak && !newStreak) {
                    db.prepare('UPDATE user_streaks SET user_id = ? WHERE user_id = ?').run(new_user_id, old_user_id);
                }

                // 2. user_progress (unique user_id, lesson_id)
                db.prepare('DELETE FROM user_progress WHERE user_id = ? AND lesson_id IN (SELECT lesson_id FROM user_progress WHERE user_id = ?)').run(old_user_id, new_user_id);
                db.prepare('UPDATE user_progress SET user_id = ? WHERE user_id = ?').run(new_user_id, old_user_id);

                // 3. saved_resources (unique user_id, resource_id)
                db.prepare('DELETE FROM saved_resources WHERE user_id = ? AND resource_id IN (SELECT resource_id FROM saved_resources WHERE user_id = ?)').run(old_user_id, new_user_id);
                db.prepare('UPDATE saved_resources SET user_id = ? WHERE user_id = ?').run(new_user_id, old_user_id);

                // 4. event_registrations (unique user_id, event_id)
                db.prepare('DELETE FROM event_registrations WHERE user_id = ? AND event_id IN (SELECT event_id FROM event_registrations WHERE user_id = ?)').run(old_user_id, new_user_id);
                db.prepare('UPDATE event_registrations SET user_id = ? WHERE user_id = ?').run(new_user_id, old_user_id);

                // 5. Non-unique child tables
                db.prepare('UPDATE translation_history SET user_id = ? WHERE user_id = ?').run(new_user_id, old_user_id);
                db.prepare('UPDATE analytics_events SET user_id = ? WHERE user_id = ?').run(new_user_id, old_user_id);
                db.prepare('UPDATE chat_conversations SET user_id = ? WHERE user_id = ?').run(new_user_id, old_user_id);
                db.prepare('UPDATE community_posts SET author_id = ? WHERE author_id = ?').run(new_user_id, old_user_id);
                db.prepare('UPDATE post_replies SET author_id = ? WHERE author_id = ?').run(new_user_id, old_user_id);
                db.prepare('UPDATE reviews SET author_id = ? WHERE author_id = ?').run(new_user_id, old_user_id);

                // 6. Delete old user row
                db.prepare('DELETE FROM users WHERE id = ?').run(old_user_id);

                // 7. Record migration event
                db.prepare(`INSERT INTO analytics_events (user_id, event_type, event_data) VALUES (?, 'identity_migrated', ?)`).run(new_user_id, JSON.stringify({ old_id: old_user_id }));
            })();
            user = db.prepare('SELECT id, email, name, nationality, preferred_language, role, created_at FROM users WHERE id = ?').get(new_user_id);
        }

        if (!user) return res.status(500).json({ error: 'Migration completed but user not found.' });

        const token = generateToken(user);
        res.json({ user, token, migrated: true });
    } catch (err) {
        console.error('Identity migration error:', err);
        res.status(err.status || 500).json({ error: err.status === 503 ? 'Persistent database is temporarily unavailable.' : 'Identity migration failed. Data preserved.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = durableDb
            ? await durableDb.getUserByEmail(normalizedEmail)
            : db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(normalizedEmail);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Update last login
        if (durableDb) await durableDb.updateLastLogin(user.id);
        else db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);

        const token = generateToken(user);
        const { password_hash, ...safeUser } = user;

        res.json({ user: safeUser, token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(err.status || 500).json({ error: err.status === 503 ? 'Persistent database is temporarily unavailable.' : 'Login failed. Please try again.' });
    }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const durableDb = req.app.locals.userDb;
        if (durableDb) {
            const profile = await durableDb.getProfile(req.user.id);
            if (!profile.user) return res.status(404).json({ error: 'User not found.' });
            return res.json(profile);
        }
        const user = db.prepare('SELECT id, email, name, nationality, preferred_language, role, onboarding_completed, onboarding_preferences, created_at, last_login_at FROM users WHERE id = ?').get(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Get streak data
        const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(req.user.id);

        res.json({ user, streak: streak || {} });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(err.status || 500).json({ error: err.status === 503 ? 'Persistent database is temporarily unavailable.' : 'Failed to load profile.' });
    }
});

// PUT /api/auth/profile - Update profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const durableDb = req.app.locals.userDb;
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
            const requestedLanguage = String(preferred_language).substring(0, 5);
            if (!SUPPORTED_LANGUAGE_CODES.has(requestedLanguage)) {
                return res.status(400).json({ error: 'Unsupported language.' });
            }
            updates.push('preferred_language = ?');
            params.push(requestedLanguage);
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

        if (durableDb) {
            const durableFields = {};
            if (name && isValidLength(name, 1, 100)) durableFields.name = sanitizeHtml(name);
            if (nationality) durableFields.nationality = sanitizeHtml(nationality);
            if (preferred_language) durableFields.preferred_language = String(preferred_language).substring(0, 5);
            if (onboarding_completed !== undefined) durableFields.onboarding_completed = onboarding_completed ? 1 : 0;
            if (onboarding_preferences) durableFields.onboarding_preferences = JSON.stringify(onboarding_preferences);
            const user = await durableDb.updateProfile(req.user.id, durableFields);
            return res.json({ user });
        }

        updates.push("updated_at = datetime('now')");
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
        res.status(err.status || 500).json({ error: err.status === 503 ? 'Persistent database is temporarily unavailable.' : 'Failed to update profile.' });
    }
});

module.exports = router;
