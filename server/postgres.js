// Durable PostgreSQL store for user-owned Saleem data.
// Static lessons, vocabulary, quizzes, culture, phrases, and verified
// directory content remain in the local content database.
const { Pool } = require('pg');

const POSTGRES_URL = process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.DATABASE_URL
    || process.env.POSTGRES_URL_NON_POOLING;
const POSTGRES_SOURCE = process.env.POSTGRES_URL
    ? 'POSTGRES_URL'
    : process.env.POSTGRES_PRISMA_URL
        ? 'POSTGRES_PRISMA_URL'
        : process.env.DATABASE_URL
            ? 'DATABASE_URL'
            : process.env.POSTGRES_URL_NON_POOLING
                ? 'POSTGRES_URL_NON_POOLING'
                : null;

const schema = [
    `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        nationality TEXT DEFAULT 'Other',
        preferred_language TEXT DEFAULT 'en',
        role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
        onboarding_completed INTEGER DEFAULT 0,
        onboarding_preferences TEXT DEFAULT '[]',
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMPTZ,
        is_active INTEGER DEFAULT 1
    )`,
    'CREATE INDEX IF NOT EXISTS idx_pg_users_email ON users(email)',
    `CREATE TABLE IF NOT EXISTS user_streaks (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_activity_date TEXT,
        total_words_learned INTEGER DEFAULT 0,
        total_phrases_mastered INTEGER DEFAULT 0,
        total_lessons_completed INTEGER DEFAULT 0,
        total_quizzes_completed INTEGER DEFAULT 0,
        level TEXT DEFAULT 'beginner',
        xp_points INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS user_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL,
        status TEXT DEFAULT 'not_started',
        score INTEGER DEFAULT 0,
        completed_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, lesson_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_pg_progress_user ON user_progress(user_id)',
    `CREATE TABLE IF NOT EXISTS saved_resources (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL,
        saved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, resource_id)
    )`,
    `CREATE TABLE IF NOT EXISTS event_registrations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, event_id)
    )`,
    `CREATE TABLE IF NOT EXISTS community_posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        author_nationality TEXT,
        title TEXT NOT NULL,
        body TEXT,
        category TEXT DEFAULT 'general',
        is_pinned INTEGER DEFAULT 0,
        is_moderated INTEGER DEFAULT 1,
        is_demo_data INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    'CREATE INDEX IF NOT EXISTS idx_pg_posts_created ON community_posts(created_at DESC)',
    `CREATE TABLE IF NOT EXISTS post_replies (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        author_nationality TEXT,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL,
        author_nationality TEXT,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        help_text TEXT NOT NULL,
        improvement_text TEXT,
        is_demo_data INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS chat_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        event_data TEXT DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS translation_history (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        source_lang TEXT,
        target_lang TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
];

function createPool(connectionString) {
    return new Pool({
        connectionString,
        max: 1,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
        allowExitOnIdle: true,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
}

class PostgresStore {
    constructor(connectionString = POSTGRES_URL) {
        if (!connectionString) throw new Error('PostgreSQL connection is not configured.');
        this.mode = 'supabase-postgres';
        this.source = POSTGRES_SOURCE;
        this.pool = createPool(connectionString);
        this.readyPromise = this.initialize();
        this.readyPromise.catch(() => {});
    }

    async initialize() {
        for (const statement of schema) await this.pool.query(statement);
    }

    async ready() {
        return this.readyPromise;
    }

    async query(text, values = []) {
        await this.ready();
        return this.pool.query(text, values);
    }

    async one(text, values = []) {
        const result = await this.query(text, values);
        return result.rows[0];
    }

    async many(text, values = []) {
        const result = await this.query(text, values);
        return result.rows;
    }

    async transaction(callback) {
        await this.ready();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async createUser(user, streakId, analyticsData) {
        return this.transaction(async (client) => {
            const result = await client.query(`
                INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role)
                VALUES ($1, $2, $3, $4, $5, $6, 'user')
                RETURNING id, email, name, nationality, preferred_language, role, created_at
            `, [user.id, user.email, user.password_hash, user.name, user.nationality, user.preferred_language]);
            await client.query('INSERT INTO user_streaks (id, user_id) VALUES ($1, $2)', [streakId, user.id]);
            await client.query('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES ($1, $2, $3)', [user.id, 'user_registered', JSON.stringify(analyticsData)]);
            return result.rows[0];
        });
    }

    getUserByEmail(email) { return this.one('SELECT * FROM users WHERE email = $1 AND is_active = 1', [email]); }
    getUserById(id) { return this.one('SELECT * FROM users WHERE id = $1', [id]); }
    updateLastLogin(id) { return this.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [id]); }
    getStreak(userId) { return this.one('SELECT * FROM user_streaks WHERE user_id = $1', [userId]); }

    async getProfile(userId) {
        const user = await this.one(`SELECT id, email, name, nationality, preferred_language, role, onboarding_completed,
            onboarding_preferences, created_at, last_login_at FROM users WHERE id = $1`, [userId]);
        const streak = await this.getStreak(userId);
        return { user, streak: streak || {} };
    }

    async updateProfile(userId, fields) {
        const allowed = ['name', 'nationality', 'preferred_language', 'onboarding_completed', 'onboarding_preferences'];
        const updates = [];
        const values = [];
        for (const key of allowed) {
            if (fields[key] !== undefined) {
                values.push(fields[key]);
                updates.push(`${key} = $${values.length}`);
            }
        }
        if (!updates.length) return null;
        values.push(userId);
        const user = await this.one(`UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}
            RETURNING id, email, name, nationality, preferred_language, role, onboarding_completed, onboarding_preferences`, values);
        if (fields.onboarding_completed) await this.recordAnalytics(userId, 'onboarding_completed');
        return user;
    }

    recordAnalytics(userId, eventType, data = {}) {
        return this.query('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES ($1, $2, $3)', [userId, eventType, JSON.stringify(data)]);
    }

    async startLesson(userId, lessonId, id, data = {}) {
        const existing = await this.one('SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2', [userId, lessonId]);
        if (existing) {
            if (existing.status === 'not_started') await this.query("UPDATE user_progress SET status = 'in_progress', started_at = CURRENT_TIMESTAMP WHERE id = $1", [existing.id]);
        } else {
            await this.query("INSERT INTO user_progress (id, user_id, lesson_id, status) VALUES ($1, $2, $3, 'in_progress')", [id, userId, lessonId]);
        }
        await this.recordAnalytics(userId, 'lesson_started', data);
    }

    async completeLesson(userId, lessonId, id, score) {
        const existing = await this.one('SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2', [userId, lessonId]);
        if (existing) {
            await this.query("UPDATE user_progress SET status = 'completed', score = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2", [score, existing.id]);
        } else {
            await this.query("INSERT INTO user_progress (id, user_id, lesson_id, status, score, completed_at) VALUES ($1, $2, $3, 'completed', $4, CURRENT_TIMESTAMP)", [id, userId, lessonId, score]);
        }
        const streak = await this.getStreak(userId);
        if (streak) {
            const today = new Date().toISOString().split('T')[0];
            let current = Number(streak.current_streak || 0);
            if (streak.last_activity_date !== today) current = streak.last_activity_date === new Date(Date.now() - 86400000).toISOString().split('T')[0] ? current + 1 : 1;
            await this.query(`UPDATE user_streaks SET current_streak = $1, longest_streak = GREATEST(longest_streak, $1),
                last_activity_date = $2, total_lessons_completed = total_lessons_completed + 1, xp_points = xp_points + $3 WHERE user_id = $4`,
            [current, today, score + 10, userId]);
        }
        await this.recordAnalytics(userId, 'lesson_completed', { lesson_id: lessonId, score });
    }

    getProgress(userId) { return this.many(`SELECT up.*, NULL AS lesson_title, NULL AS difficulty, NULL AS category_name, NULL AS category_icon
        FROM user_progress up WHERE up.user_id = $1 ORDER BY up.started_at DESC`, [userId]); }
    getLessonProgress(userId, lessonId) { return this.one('SELECT * FROM user_progress WHERE user_id = $1 AND lesson_id = $2', [userId, lessonId]); }

    async getUserStats(userId) {
        const streak = await this.getStreak(userId);
        const completed = await this.one("SELECT COUNT(*)::int AS count FROM user_progress WHERE user_id = $1 AND status = 'completed'", [userId]);
        const saved = await this.one('SELECT COUNT(*)::int AS count FROM saved_resources WHERE user_id = $1', [userId]);
        const events = await this.one('SELECT COUNT(*)::int AS count FROM event_registrations WHERE user_id = $1', [userId]);
        const ai = await this.one("SELECT COUNT(*)::int AS count FROM chat_messages cm JOIN chat_conversations cc ON cm.conversation_id = cc.id WHERE cc.user_id = $1 AND cm.role = 'user'", [userId]);
        return { streak: streak || { current_streak: 0, total_lessons_completed: 0, total_words_learned: 0, level: 'beginner' }, completed_lessons: completed.count, saved_resources: saved.count, registered_events: events.count, ai_messages_sent: ai.count };
    }

    getSavedResources(userId) { return this.many('SELECT * FROM saved_resources WHERE user_id = $1 ORDER BY saved_at DESC', [userId]); }
    getRegisteredEvents(userId) { return this.many('SELECT * FROM event_registrations WHERE user_id = $1 ORDER BY registered_at DESC', [userId]); }
    async toggleSavedResource(userId, resourceId, id) {
        const existing = await this.one('SELECT id FROM saved_resources WHERE user_id = $1 AND resource_id = $2', [userId, resourceId]);
        if (existing) { await this.query('DELETE FROM saved_resources WHERE id = $1', [existing.id]); return false; }
        await this.query('INSERT INTO saved_resources (id, user_id, resource_id) VALUES ($1, $2, $3)', [id, userId, resourceId]);
        await this.recordAnalytics(userId, 'resource_saved', { resource_id: resourceId });
        return true;
    }

    async listCommunityPosts({ category, page = 1, limit = 20, includeDemo = false }) {
        const values = [];
        let where = includeDemo ? '' : 'WHERE is_demo_data = 0';
        if (category && category !== 'all') { values.push(category); where += `${where ? ' AND' : 'WHERE'} category = $${values.length}`; }
        values.push(Number(limit), (Number(page) - 1) * Number(limit));
        const posts = await this.many(`SELECT * FROM community_posts ${where} ORDER BY is_pinned DESC, created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
        for (const post of posts) post.replies = await this.many('SELECT * FROM post_replies WHERE post_id = $1 ORDER BY created_at ASC', [post.id]);
        return posts;
    }

    async createCommunityPost(post) {
        const user = await this.one('SELECT name, nationality FROM users WHERE id = $1', [post.author_id]);
        await this.query(`INSERT INTO community_posts (id, author_id, author_name, author_nationality, title, body, category)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`, [post.id, post.author_id, user.name, user.nationality, post.title, post.body, post.category]);
        const result = await this.one('SELECT * FROM community_posts WHERE id = $1', [post.id]);
        result.replies = [];
        return result;
    }

    async createReply(reply) {
        const user = await this.one('SELECT name, nationality FROM users WHERE id = $1', [reply.author_id]);
        await this.query(`INSERT INTO post_replies (id, post_id, author_id, author_name, author_nationality, body)
            VALUES ($1, $2, $3, $4, $5, $6)`, [reply.id, reply.post_id, reply.author_id, user.name, user.nationality, reply.body]);
        return this.one('SELECT * FROM post_replies WHERE id = $1', [reply.id]);
    }

    getReviews() { return this.many('SELECT * FROM reviews WHERE is_demo_data = 0 ORDER BY created_at DESC LIMIT 50'); }
    getReviewSummary() { return this.one('SELECT COUNT(*)::int AS count, AVG(rating) AS avg_rating FROM reviews WHERE is_demo_data = 0'); }
    async createReview(review) {
        const user = await this.one('SELECT name, nationality FROM users WHERE id = $1', [review.author_id]);
        await this.query(`INSERT INTO reviews (id, author_id, author_name, author_nationality, rating, help_text, improvement_text)
            VALUES ($1, $2, $3, $4, $5, $6, $7)`, [review.id, review.author_id, user.name, user.nationality, review.rating, review.help_text, review.improvement_text]);
        return this.one('SELECT * FROM reviews WHERE id = $1', [review.id]);
    }

    createConversation(id, userId, title) { return this.query('INSERT INTO chat_conversations (id, user_id, title) VALUES ($1, $2, $3)', [id, userId, title]); }
    addChatMessage(id, conversationId, role, content) { return this.query('INSERT INTO chat_messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)', [id, conversationId, role, content]); }
    getRecentMessages(conversationId) { return this.many('SELECT role, content FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 10', [conversationId]); }
    touchConversation(id) { return this.query('UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]); }
    getConversations(userId) { return this.many('SELECT * FROM chat_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 20', [userId]); }
    getConversation(id, userId) { return this.one('SELECT * FROM chat_conversations WHERE id = $1 AND user_id = $2', [id, userId]); }
    getMessages(conversationId) { return this.many('SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at', [conversationId]); }
    saveTranslation(translation) { return this.query('INSERT INTO translation_history (id, user_id, source_text, translated_text, source_lang, target_lang) VALUES ($1, $2, $3, $4, $5, $6)', Object.values(translation)); }
    registerEvent(userId, eventId, id) { return this.query('INSERT INTO event_registrations (id, user_id, event_id) VALUES ($1, $2, $3)', [id, userId, eventId]); }
    getEventRegistration(userId, eventId) { return this.one('SELECT id FROM event_registrations WHERE user_id = $1 AND event_id = $2', [userId, eventId]); }
    countEventRegistrations(eventId) { return this.one('SELECT COUNT(*)::int AS count FROM event_registrations WHERE event_id = $1', [eventId]); }
    removeEventRegistration(id) { return this.query('DELETE FROM event_registrations WHERE id = $1', [id]); }
    getCommunityPostId(id) { return this.one('SELECT id FROM community_posts WHERE id = $1', [id]); }
}

function hasPostgresConfig() {
    return Boolean(POSTGRES_URL);
}

function createPostgresStore() {
    return hasPostgresConfig() ? new PostgresStore() : null;
}

module.exports = { PostgresStore, createPostgresStore, hasPostgresConfig, POSTGRES_SOURCE };
