// Durable PostgreSQL store for user-owned Saleem data.
// Static lessons, vocabulary, quizzes, culture, phrases, and verified
// directory content remain in the local content database.
const { Pool, Client } = require('pg');
const dns = require('node:dns').promises;
const net = require('node:net');
const { parse: parseConnectionString } = require('pg-connection-string');

// Prefer the explicitly configured transaction-pooler URL. Marketplace
// variables remain supported as compatibility fallbacks for existing deploys.
const POSTGRES_URL = process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.POSTGRES_URL_NON_POOLING;
const POSTGRES_SOURCE = process.env.DATABASE_URL
    ? 'DATABASE_URL'
    : process.env.POSTGRES_URL
        ? 'POSTGRES_URL'
        : process.env.POSTGRES_PRISMA_URL
            ? 'POSTGRES_PRISMA_URL'
            : process.env.POSTGRES_URL_NON_POOLING
                ? 'POSTGRES_URL_NON_POOLING'
                : null;

function postgresSslConfig() {
    if (process.env.NODE_ENV !== 'production') return undefined;
    const ca = process.env.SUPABASE_CA_CERT || process.env.PGSSLROOTCERT;
    return ca ? { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true } : true;
}

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
    `CREATE TABLE IF NOT EXISTS analytics_users (
        id TEXT PRIMARY KEY,
        auth_user_id TEXT,
        anonymous_id TEXT,
        display_name TEXT,
        country TEXT DEFAULT 'Other',
        preferred_language TEXT DEFAULT 'en',
        platform TEXT DEFAULT 'web',
        first_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        anonymous_id TEXT,
        platform TEXT DEFAULT 'web',
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMPTZ,
        duration_seconds INTEGER DEFAULT 0,
        last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT,
        anonymous_id TEXT,
        session_id TEXT,
        event_type TEXT NOT NULL,
        event_category TEXT DEFAULT 'general',
        page_or_screen TEXT,
        lesson_id INTEGER,
        quiz_id TEXT,
        event_data TEXT DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS lesson_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        lesson_id INTEGER NOT NULL,
        track TEXT DEFAULT 'dialect',
        progress_percentage INTEGER DEFAULT 0,
        quiz_score INTEGER,
        started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        duration_seconds INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_user_lesson_track UNIQUE (user_id, lesson_id, track)
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_daily (
        date DATE PRIMARY KEY,
        new_users INTEGER DEFAULT 0,
        active_users INTEGER DEFAULT 0,
        unique_visitors INTEGER DEFAULT 0,
        total_sessions INTEGER DEFAULT 0,
        page_views INTEGER DEFAULT 0,
        lessons_started INTEGER DEFAULT 0,
        lessons_completed INTEGER DEFAULT 0,
        learning_seconds BIGINT DEFAULT 0,
        android_sessions INTEGER DEFAULT 0,
        web_sessions INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
        // Queries below never set a named statement, so transaction pooling
        // does not depend on session-level prepared-statement state.
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 7000,
        allowExitOnIdle: true,
        ssl: postgresSslConfig(),
    });
}

function classifyConnectionError(error, fallback = 'OTHER') {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA') return 'DNS';
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || message.includes('timeout')) return 'TIMEOUT';
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'TCP';
    if (code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || message.includes('tls') || message.includes('certificate')) return 'TLS';
    if (code === '28P01' || code === '28000') return 'AUTH';
    if (code === '3D000') return 'DATABASE';
    if (code === '53300' || code === '57P03') return 'POOLER';
    return fallback;
}

function safeErrorCode(error) {
    const code = String(error?.code || '').trim();
    return /^[A-Za-z0-9_.-]{1,32}$/.test(code) ? code : null;
}

function parseRuntimeMetadata(connectionString) {
    const parsed = parseConnectionString(connectionString);
    const protocolMatch = String(connectionString).match(/^([^:]+):\/\//);
    const host = String(parsed.host || '').toLowerCase();
    const password = parsed.password == null ? '' : String(parsed.password);
    return {
        protocol: protocolMatch ? protocolMatch[1].toLowerCase() : null,
        hostname: host || null,
        port: parsed.port ? Number(parsed.port) : 5432,
        database: parsed.database || null,
        username_exists: Boolean(parsed.user),
        password_exists: password.length > 0,
        password_placeholder: /your[-_ ]?password|\[password\]|placeholder/i.test(password),
        pooler_hostname: host.endsWith('.pooler.supabase.com'),
        _config: {
            host,
            port: parsed.port ? Number(parsed.port) : 5432,
            database: parsed.database || undefined,
            user: parsed.user || undefined,
            password: parsed.password || undefined,
        },
    };
}

function withTimeout(promise, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('diagnostic timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function resolveDatabaseHost(host) {
    try {
        const addresses = await withTimeout(dns.lookup(host, { all: true, verbatim: true }), 5000);
        return { status: 'PASS', address_families: [...new Set(addresses.map(({ family }) => `IPv${family}`))] };
    } catch (error) {
        return { status: 'FAIL', error_class: classifyConnectionError(error, 'DNS'), error_code: safeErrorCode(error) };
    }
}

function testTcpEndpoint(host, port) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (status, error) => {
            if (settled) return;
            settled = true;
            resolve({ status, error_code: safeErrorCode(error) });
        };
        const socket = net.createConnection({ host, port });
        socket.setTimeout(5000, () => {
            socket.destroy();
            finish('TIMEOUT', { code: 'ETIMEDOUT' });
        });
        socket.once('connect', () => {
            socket.destroy();
            finish('PASS');
        });
        socket.once('error', (error) => {
            socket.destroy();
            const errorClass = classifyConnectionError(error, 'TCP');
            finish(errorClass === 'DNS' ? 'DNS FAILURE' : error.code === 'ECONNREFUSED' ? 'REFUSED' : errorClass === 'TCP' ? 'FAIL' : errorClass, error);
        });
    });
}

async function freshSelectOne(config) {
    const client = new Client({
        ...config,
        connectionTimeoutMillis: 7000,
        query_timeout: 7000,
        statement_timeout: 7000,
        ssl: postgresSslConfig(),
    });
    try {
        await client.connect();
        const result = await client.query('SELECT 1');
        return { status: result.rows[0]?.['?column?'] === 1 ? 'PASS' : 'FAIL' };
    } catch (error) {
        return { status: 'FAIL', error_class: classifyConnectionError(error, 'POSTGRES'), error_code: safeErrorCode(error) };
    } finally {
        await client.end().catch(() => {});
    }
}

async function diagnosePostgresConnection(connectionString = POSTGRES_URL) {
    if (!connectionString) return { configured: false, first_failure: 'ENV' };
    let metadata;
    try {
        metadata = parseRuntimeMetadata(connectionString);
    } catch (error) {
        return { configured: true, parse: 'FAIL', first_failure: 'ENV', error_class: 'OTHER', error_code: safeErrorCode(error) };
    }

    const { _config: config, ...safeMetadata } = metadata;
    const dnsResult = await resolveDatabaseHost(config.host);
    if (dnsResult.status !== 'PASS') {
        return { configured: true, ...safeMetadata, dns: dnsResult, tcp_6543: { status: 'DNS FAILURE' }, select_1: 'FAIL', first_failure: 'DNS', supavisor: 'UNABLE_TO_INSPECT' };
    }

    const tcp6543 = await testTcpEndpoint(config.host, 6543);
    if (tcp6543.status !== 'PASS') {
        const tcp5432 = await testTcpEndpoint(config.host, 5432);
        return { configured: true, ...safeMetadata, dns: dnsResult, tcp_6543: tcp6543, session_5432: tcp5432.status, select_1: 'NOT_REACHED', first_failure: 'TCP', tcp_6543_classification: tcp6543.status, supavisor: 'UNABLE_TO_INSPECT' };
    }

    const select1 = await freshSelectOne(config);
    let session5432 = null;
    if (select1.status !== 'PASS') session5432 = await freshSelectOne({ ...config, port: 5432 });
    return {
        configured: true,
        ...safeMetadata,
        dns: dnsResult,
        tcp_6543: tcp6543,
        tls: select1.status === 'PASS' ? 'PASS' : (select1.error_class === 'TLS' ? 'FAIL' : 'NOT_PROVEN'),
        tls_ca_configured: Boolean(process.env.SUPABASE_CA_CERT || process.env.PGSSLROOTCERT),
        postgresql_authentication: select1.status === 'PASS' ? 'PASS' : (select1.error_class === 'AUTH' ? 'FAIL' : 'NOT_PROVEN'),
        select_1: select1.status,
        select_1_error_class: select1.error_class || null,
        select_1_error_code: select1.error_code || null,
        session_5432: session5432 ? { status: session5432.status, error_class: session5432.error_class || null, error_code: session5432.error_code || null } : 'NOT_TESTED',
        first_failure: select1.status === 'PASS' ? null : (select1.error_class || 'POSTGRES'),
        supavisor: 'UNABLE_TO_INSPECT',
    };
}

class PostgresStore {
    constructor(connectionString = POSTGRES_URL) {
        if (!connectionString) throw new Error('PostgreSQL connection is not configured.');
        this.mode = 'supabase-postgres';
        this.source = POSTGRES_SOURCE;
        this.connectionString = connectionString;
        this.pool = createPool(connectionString);
        this.readyPromise = this.initialize();
        this.readyPromise.catch(() => {});
    }

    async initialize() {
        for (const statement of schema) await this.pool.query(statement);
    }

    async ready() {
        try {
            if (!this.readyPromise) this.readyPromise = this.initialize();
            return await this.readyPromise;
        } catch (error) {
            this.readyPromise = null;
            await this.pool.end().catch(() => {});
            this.pool = createPool(this.connectionString);
            error.status = 503;
            error.code = 'PERSISTENCE_UNAVAILABLE';
            throw error;
        }
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

    async createAnonymousUser(supabaseUid, name, nationality, lang, streakId) {
        return this.transaction(async (client) => {
            const syntheticEmail = `${supabaseUid}@anon.saleem.local`;
            // Anonymous users have no real password; store a placeholder hash
            const placeholderHash = '$2a$10$ANON_USER_NO_PASSWORD_HASH_PLACEHOLDER00000000000000000';
            const result = await client.query(`
                INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role)
                VALUES ($1, $2, $3, $4, $5, $6, 'user')
                ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, nationality = EXCLUDED.nationality,
                    preferred_language = EXCLUDED.preferred_language, updated_at = CURRENT_TIMESTAMP
                RETURNING id, email, name, nationality, preferred_language, role, created_at
            `, [supabaseUid, syntheticEmail, placeholderHash, name, nationality, lang]);
            // Only create streak if it doesn't exist yet
            await client.query(`INSERT INTO user_streaks (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [streakId, supabaseUid]);
            await client.query('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES ($1, $2, $3)',
                [supabaseUid, 'anonymous_registration', JSON.stringify({ nationality, language: lang })]);
            return result.rows[0];
        });
    }

    async migrateUserIdentity(oldId, newId) {
        return this.transaction(async (client) => {
            // Verify old user exists
            const oldUserRes = await client.query('SELECT * FROM users WHERE id = $1', [oldId]);
            const oldUser = oldUserRes.rows[0];
            if (!oldUser) throw Object.assign(new Error('Legacy user not found'), { status: 404 });

            // Check if newId already has a user row (e.g. from register-anon)
            const newUserRes = await client.query('SELECT id FROM users WHERE id = $1', [newId]);
            const newUser = newUserRes.rows[0];
            const newEmail = `${newId}@anon.saleem.local`;

            if (!newUser) {
                // Insert new user copying details from old user
                await client.query(`
                    INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role, onboarding_completed, onboarding_preferences, avatar_url, created_at, updated_at, last_login_at, is_active)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP, $12, $13)
                `, [
                    newId,
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
                ]);
            } else {
                await client.query(`
                    UPDATE users SET name = COALESCE(NULLIF(name, ''), $1), nationality = COALESCE(NULLIF(nationality, ''), $2), preferred_language = COALESCE(NULLIF(preferred_language, ''), $3), updated_at = CURRENT_TIMESTAMP
                    WHERE id = $4
                `, [oldUser.name, oldUser.nationality, oldUser.preferred_language, newId]);
            }

            // Merge unique child tables
            const newStreakRes = await client.query('SELECT * FROM user_streaks WHERE user_id = $1', [newId]);
            const oldStreakRes = await client.query('SELECT * FROM user_streaks WHERE user_id = $1', [oldId]);
            const newStreak = newStreakRes.rows[0];
            const oldStreak = oldStreakRes.rows[0];
            if (newStreak && oldStreak) {
                await client.query(`
                    UPDATE user_streaks SET
                        current_streak = GREATEST(current_streak, $1),
                        longest_streak = GREATEST(longest_streak, $2),
                        total_words_learned = total_words_learned + $3,
                        total_phrases_mastered = total_phrases_mastered + $4,
                        total_lessons_completed = total_lessons_completed + $5,
                        total_quizzes_completed = total_quizzes_completed + $6,
                        xp_points = xp_points + $7
                    WHERE user_id = $8
                `, [
                    oldStreak.current_streak || 0,
                    oldStreak.longest_streak || 0,
                    oldStreak.total_words_learned || 0,
                    oldStreak.total_phrases_mastered || 0,
                    oldStreak.total_lessons_completed || 0,
                    oldStreak.total_quizzes_completed || 0,
                    oldStreak.xp_points || 0,
                    newId
                ]);
                await client.query('DELETE FROM user_streaks WHERE user_id = $1', [oldId]);
            } else if (oldStreak && !newStreak) {
                await client.query('UPDATE user_streaks SET user_id = $1 WHERE user_id = $2', [newId, oldId]);
            }

            // 2. user_progress (unique user_id, lesson_id)
            await client.query('DELETE FROM user_progress WHERE user_id = $1 AND lesson_id IN (SELECT lesson_id FROM user_progress WHERE user_id = $2)', [oldId, newId]);
            await client.query('UPDATE user_progress SET user_id = $1 WHERE user_id = $2', [newId, oldId]);

            // 3. saved_resources (unique user_id, resource_id)
            await client.query('DELETE FROM saved_resources WHERE user_id = $1 AND resource_id IN (SELECT resource_id FROM saved_resources WHERE user_id = $2)', [oldId, newId]);
            await client.query('UPDATE saved_resources SET user_id = $1 WHERE user_id = $2', [newId, oldId]);

            // 4. event_registrations (unique user_id, event_id)
            await client.query('DELETE FROM event_registrations WHERE user_id = $1 AND event_id IN (SELECT event_id FROM event_registrations WHERE user_id = $2)', [oldId, newId]);
            await client.query('UPDATE event_registrations SET user_id = $1 WHERE user_id = $2', [newId, oldId]);

            // 5. Non-unique tables
            await client.query('UPDATE translation_history SET user_id = $1 WHERE user_id = $2', [newId, oldId]);
            await client.query('UPDATE analytics_events SET user_id = $1 WHERE user_id = $2', [newId, oldId]);
            await client.query('UPDATE chat_conversations SET user_id = $1 WHERE user_id = $2', [newId, oldId]);
            await client.query('UPDATE community_posts SET author_id = $1 WHERE author_id = $2', [newId, oldId]);
            await client.query('UPDATE post_replies SET author_id = $1 WHERE author_id = $2', [newId, oldId]);
            await client.query('UPDATE reviews SET author_id = $1 WHERE author_id = $2', [newId, oldId]);

            // 6. Delete old user row (CASCADE handles any remaining)
            await client.query('DELETE FROM users WHERE id = $1', [oldId]);

            // 7. Record analytics event
            await client.query('INSERT INTO analytics_events (user_id, event_type, event_data) VALUES ($1, $2, $3)',
                [newId, 'identity_migrated', JSON.stringify({ old_id: oldId })]);

            const migrated = await client.query(`SELECT id, email, name, nationality, preferred_language, role, created_at FROM users WHERE id = $1`, [newId]);
            return migrated.rows[0];
        });
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

    // =============================================================
    // ADMIN & ANALYTICS PIPELINE METHODS
    // =============================================================
    async recordAnalyticsEventDetailed({ userId, anonymousId, sessionId, eventType, category = 'general', page, lessonId, quizId, metadata = {} }) {
        try {
            await this.query(
                `INSERT INTO analytics_events (user_id, anonymous_id, session_id, event_type, event_category, page_or_screen, lesson_id, quiz_id, event_data, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)`,
                [userId || null, anonymousId || null, sessionId || null, eventType, category, page || null, lessonId || null, quizId || null, JSON.stringify(metadata)]
            );

            // Update user last_active_at if user exists
            if (userId) {
                await this.query(
                    `INSERT INTO analytics_users (id, auth_user_id, anonymous_id, last_active_at, last_seen_at)
                     VALUES ($1, $1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     ON CONFLICT (id) DO UPDATE SET last_active_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP`,
                    [userId, anonymousId || null]
                );
            } else if (anonymousId) {
                await this.query(
                    `INSERT INTO analytics_users (id, anonymous_id, last_active_at, last_seen_at)
                     VALUES ($1, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     ON CONFLICT (id) DO UPDATE SET last_active_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP`,
                    [anonymousId]
                );
            }

            // Update session last_activity_at
            if (sessionId) {
                await this.query(
                    `INSERT INTO analytics_sessions (id, user_id, anonymous_id, last_activity_at)
                     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                     ON CONFLICT (id) DO UPDATE SET last_activity_at = CURRENT_TIMESTAMP`,
                    [sessionId, userId || null, anonymousId || null]
                );
            }
            return true;
        } catch (err) {
            console.warn('[Analytics Store] Record event notice:', err?.message || err);
            return false;
        }
    }

    async recordSessionHeartbeat({ sessionId, userId, anonymousId, platform = 'web', durationSeconds = 0 }) {
        try {
            await this.query(
                `INSERT INTO analytics_sessions (id, user_id, anonymous_id, platform, started_at, duration_seconds, last_activity_at)
                 VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, CURRENT_TIMESTAMP)
                 ON CONFLICT (id) DO UPDATE SET
                    duration_seconds = GREATEST(analytics_sessions.duration_seconds, EXCLUDED.duration_seconds),
                    last_activity_at = CURRENT_TIMESTAMP,
                    user_id = COALESCE(EXCLUDED.user_id, analytics_sessions.user_id),
                    platform = COALESCE(EXCLUDED.platform, analytics_sessions.platform)`,
                [sessionId, userId || null, anonymousId || null, platform, durationSeconds]
            );

            const activeId = userId || anonymousId;
            if (activeId) {
                await this.query(
                    `UPDATE analytics_users SET last_active_at = CURRENT_TIMESTAMP, platform = COALESCE($2, platform) WHERE id = $1`,
                    [activeId, platform]
                );
            }
            return true;
        } catch (err) {
            console.warn('[Analytics Store] Heartbeat notice:', err?.message || err);
            return false;
        }
    }

    async getAdminOverview(timeRange = '7d') {
        const LEGACY_USER_BASELINE = 50;

        // Total tracked unique users
        const usersRow = await this.one(`SELECT COUNT(DISTINCT id)::int AS count FROM users WHERE role = 'user' OR role IS NULL`) || { count: 0 };
        const trackedUsers = usersRow.count || 0;
        const totalDisplayedUsers = LEGACY_USER_BASELINE + trackedUsers;

        // Online now (active in last 2 minutes)
        const onlineRow = await this.one(
            `SELECT COUNT(DISTINCT user_id)::int AS count FROM analytics_sessions
             WHERE last_activity_at >= CURRENT_TIMESTAMP - INTERVAL '2 minutes'`
        ) || { count: 0 };

        // Active today, 7d, 30d
        const activeTodayRow = await this.one(
            `SELECT COUNT(DISTINCT user_id)::int AS count FROM analytics_events
             WHERE created_at >= CURRENT_DATE`
        ) || { count: 0 };

        const active7dRow = await this.one(
            `SELECT COUNT(DISTINCT user_id)::int AS count FROM analytics_events
             WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
        ) || { count: 0 };

        const active30dRow = await this.one(
            `SELECT COUNT(DISTINCT user_id)::int AS count FROM analytics_events
             WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
        ) || { count: 0 };

        // Visitors & sessions today
        const visitorsTodayRow = await this.one(
            `SELECT COUNT(DISTINCT COALESCE(user_id, anonymous_id))::int AS count FROM analytics_sessions
             WHERE started_at >= CURRENT_DATE`
        ) || { count: 0 };

        const sessionsTodayRow = await this.one(
            `SELECT COUNT(*)::int AS count FROM analytics_sessions WHERE started_at >= CURRENT_DATE`
        ) || { count: 0 };

        // Learning stats
        const lessonsStartedRow = await this.one(
            `SELECT COUNT(*)::int AS count FROM analytics_events WHERE event_type = 'lesson_started'`
        ) || { count: 0 };

        const lessonsCompletedRow = await this.one(
            `SELECT COUNT(*)::int AS count FROM analytics_events WHERE event_type = 'lesson_completed'`
        ) || { count: 0 };

        const completionRate = lessonsStartedRow.count > 0
            ? Number(((lessonsCompletedRow.count / lessonsStartedRow.count) * 100).toFixed(1))
            : 0;

        // Session duration stats
        const sessionStats = await this.one(
            `SELECT AVG(duration_seconds)::int AS avg_dur, SUM(duration_seconds)::bigint AS total_dur
             FROM analytics_sessions WHERE duration_seconds > 0 AND duration_seconds < 86400`
        ) || { avg_dur: 0, total_dur: 0 };

        // Platform breakdown
        const platformStats = await this.many(
            `SELECT COALESCE(platform, 'web') AS platform, COUNT(*)::int AS count
             FROM analytics_sessions GROUP BY COALESCE(platform, 'web')`
        ) || [];

        return {
            baseline: {
                historical_baseline: LEGACY_USER_BASELINE,
                tracked_users: trackedUsers,
                total_displayed_users: totalDisplayedUsers
            },
            activity: {
                online_now: onlineRow.count || 0,
                active_today: activeTodayRow.count || 0,
                active_last_7_days: active7dRow.count || 0,
                active_last_30_days: active30dRow.count || 0,
                visitors_today: visitorsTodayRow.count || 0,
                sessions_today: sessionsTodayRow.count || 0
            },
            learning: {
                lessons_started: lessonsStartedRow.count || 0,
                lessons_completed: lessonsCompletedRow.count || 0,
                completion_rate_percentage: completionRate,
                total_learning_seconds: Number(sessionStats.total_dur || 0),
                average_session_duration_seconds: sessionStats.avg_dur || 0
            },
            platforms: platformStats
        };
    }

    async getAdminLiveUsers() {
        const liveUsers = await this.many(
            `SELECT s.id AS session_id, s.user_id, s.anonymous_id, s.platform, s.duration_seconds, s.last_activity_at,
                    u.display_name, u.country, u.preferred_language
             FROM analytics_sessions s
             LEFT JOIN analytics_users u ON COALESCE(s.user_id, s.anonymous_id) = u.id
             WHERE s.last_activity_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
             ORDER BY s.last_activity_at DESC LIMIT 50`
        ) || [];

        const recentEvents = await this.many(
            `SELECT e.id, e.user_id, e.event_type, e.event_category, e.page_or_screen, e.lesson_id, e.created_at,
                    u.display_name, u.country
             FROM analytics_events e
             LEFT JOIN analytics_users u ON e.user_id = u.id
             ORDER BY e.created_at DESC LIMIT 25`
        ) || [];

        const onlineCount = await this.one(
            `SELECT COUNT(DISTINCT COALESCE(user_id, anonymous_id))::int AS count
             FROM analytics_sessions WHERE last_activity_at >= CURRENT_TIMESTAMP - INTERVAL '2 minutes'`
        ) || { count: 0 };

        return {
            online_now: onlineCount.count || 0,
            active_sessions: liveUsers,
            recent_activity: recentEvents
        };
    }

    async getAdminUserGrowth(timeRange = '30d') {
        const days = timeRange === '7d' ? 7 : timeRange === '90d' ? 90 : 30;
        const dailyGrowth = await this.many(
            `SELECT d::date AS date,
                    COUNT(u.id)::int AS new_users
             FROM generate_series(CURRENT_DATE - INTERVAL '${days} days', CURRENT_DATE, '1 day'::interval) d
             LEFT JOIN users u ON u.created_at::date = d::date
             GROUP BY d::date
             ORDER BY d::date ASC`
        ) || [];

        const LEGACY_USER_BASELINE = 50;
        let cumulative = LEGACY_USER_BASELINE;
        const result = dailyGrowth.map(row => {
            cumulative += row.new_users;
            return {
                date: row.date,
                new_users: row.new_users,
                cumulative_tracked: cumulative - LEGACY_USER_BASELINE,
                cumulative_displayed: cumulative
            };
        });

        return { baseline: LEGACY_USER_BASELINE, growth: result };
    }

    async getAdminLearningAnalytics() {
        // Funnel
        const funnelViews = await this.one("SELECT COUNT(*)::int AS c FROM analytics_events WHERE event_type = 'lesson_viewed'") || { c: 0 };
        const funnelStarts = await this.one("SELECT COUNT(*)::int AS c FROM analytics_events WHERE event_type = 'lesson_started'") || { c: 0 };
        const funnelCompletions = await this.one("SELECT COUNT(*)::int AS c FROM analytics_events WHERE event_type = 'lesson_completed'") || { c: 0 };
        const funnelQuizzes = await this.one("SELECT COUNT(*)::int AS c FROM analytics_events WHERE event_type = 'quiz_completed'") || { c: 0 };

        // Most completed lessons
        const mostCompleted = await this.many(
            `SELECT lesson_id, COUNT(*)::int AS completions
             FROM analytics_events WHERE event_type = 'lesson_completed' AND lesson_id IS NOT NULL
             GROUP BY lesson_id ORDER BY completions DESC LIMIT 10`
        ) || [];

        // Most abandoned lessons (high start, low completion)
        const abandoned = await this.many(
            `SELECT s.lesson_id,
                    s.starts,
                    COALESCE(c.comps, 0) AS completions,
                    (s.starts - COALESCE(c.comps, 0)) AS abandonments
             FROM (SELECT lesson_id, COUNT(*)::int AS starts FROM analytics_events WHERE event_type = 'lesson_started' AND lesson_id IS NOT NULL GROUP BY lesson_id) s
             LEFT JOIN (SELECT lesson_id, COUNT(*)::int AS comps FROM analytics_events WHERE event_type = 'lesson_completed' AND lesson_id IS NOT NULL GROUP BY lesson_id) c ON s.lesson_id = c.lesson_id
             ORDER BY abandonments DESC LIMIT 10`
        ) || [];

        return {
            funnel: {
                viewed: funnelViews.c,
                started: funnelStarts.c,
                completed: funnelCompletions.c,
                quiz_completed: funnelQuizzes.c
            },
            most_completed: mostCompleted,
            most_abandoned: abandoned
        };
    }

    async getAdminUsersList({ page = 1, limit = 50, search = '', filterCountry = '', filterLang = '', filterPlatform = '' }) {
        const offset = (Number(page) - 1) * Number(limit);
        let where = "WHERE (u.role = 'user' OR u.role IS NULL)";
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            where += ` AND (u.name ILIKE ${params.length} OR u.email ILIKE ${params.length} OR u.id ILIKE ${params.length})`;
        }
        if (filterCountry) {
            params.push(filterCountry);
            where += ` AND u.nationality = ${params.length}`;
        }
        if (filterLang) {
            params.push(filterLang);
            where += ` AND u.preferred_language = ${params.length}`;
        }

        const totalRow = await this.one(`SELECT COUNT(*)::int AS count FROM users u ${where}`, params) || { count: 0 };

        params.push(Number(limit), offset);
        const users = await this.many(
            `SELECT u.id, u.email, u.name AS display_name, u.nationality AS country, u.preferred_language,
                    u.created_at, u.last_login_at,
                    COALESCE(s.last_activity_at, u.last_login_at, u.created_at) AS last_active,
                    COALESCE(prog.completed_count, 0)::int AS lessons_completed,
                    COALESCE(sess.session_count, 0)::int AS session_count,
                    COALESCE(sess.total_duration, 0)::int AS total_duration_seconds,
                    CASE WHEN s.last_activity_at >= CURRENT_TIMESTAMP - INTERVAL '2 minutes' THEN 'online' ELSE 'offline' END AS status
             FROM users u
             LEFT JOIN (SELECT user_id, MAX(last_activity_at) AS last_activity_at FROM analytics_sessions GROUP BY user_id) s ON u.id = s.user_id
             LEFT JOIN (SELECT user_id, COUNT(*)::int AS completed_count FROM user_progress WHERE status = 'completed' GROUP BY user_id) prog ON u.id = prog.user_id
             LEFT JOIN (SELECT user_id, COUNT(*)::int AS session_count, SUM(duration_seconds)::int AS total_duration FROM analytics_sessions GROUP BY user_id) sess ON u.id = sess.user_id
             ${where}
             ORDER BY last_active DESC
             LIMIT ${params.length - 1} OFFSET ${params.length}`,
            params
        ) || [];

        return { users, total: totalRow.count, page: Number(page), limit: Number(limit) };
    }

    async getAdminUserDetails(userId) {
        const user = await this.one(
            `SELECT u.id, u.email, u.name AS display_name, u.nationality AS country, u.preferred_language,
                    u.created_at, u.last_login_at,
                    COALESCE(sess.session_count, 0)::int AS total_sessions,
                    COALESCE(sess.total_duration, 0)::int AS total_learning_seconds,
                    COALESCE(prog.completed_count, 0)::int AS lessons_completed
             FROM users u
             LEFT JOIN (SELECT user_id, COUNT(*)::int AS session_count, SUM(duration_seconds)::int AS total_duration FROM analytics_sessions WHERE user_id = $1 GROUP BY user_id) sess ON true
             LEFT JOIN (SELECT user_id, COUNT(*)::int AS completed_count FROM user_progress WHERE user_id = $1 AND status = 'completed' GROUP BY user_id) prog ON true
             WHERE u.id = $1`,
            [userId]
        );

        if (!user) return null;

        // Timeline of recent activity
        const timeline = await this.many(
            `SELECT event_type, event_category, page_or_screen, lesson_id, event_data, created_at
             FROM analytics_events WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 50`,
            [userId]
        ) || [];

        // Completed lessons
        const completedLessons = await this.many(
            `SELECT lesson_id, score, started_at, completed_at
             FROM user_progress WHERE user_id = $1 AND status = 'completed'
             ORDER BY completed_at DESC`,
            [userId]
        ) || [];

        // Sessions
        const sessions = await this.many(
            `SELECT id, platform, started_at, ended_at, duration_seconds, last_activity_at
             FROM analytics_sessions WHERE user_id = $1
             ORDER BY started_at DESC LIMIT 30`,
            [userId]
        ) || [];

        return { user, timeline, completed_lessons: completedLessons, sessions };
    }

    async getAdminCountryStats() {
        return this.many(
            `SELECT COALESCE(nationality, 'Other') AS country, COUNT(*)::int AS user_count
             FROM users WHERE role = 'user' OR role IS NULL
             GROUP BY COALESCE(nationality, 'Other')
             ORDER BY user_count DESC`
        ) || [];
    }

    async getAdminLanguageStats() {
        return this.many(
            `SELECT COALESCE(preferred_language, 'en') AS language, COUNT(*)::int AS user_count
             FROM users WHERE role = 'user' OR role IS NULL
             GROUP BY COALESCE(preferred_language, 'en')
             ORDER BY user_count DESC`
        ) || [];
    }

    async getAdminPlatformStats() {
        return this.many(
            `SELECT COALESCE(platform, 'web') AS platform, COUNT(*)::int AS session_count,
                    AVG(duration_seconds)::int AS avg_duration_seconds
             FROM analytics_sessions
             GROUP BY COALESCE(platform, 'web')
             ORDER BY session_count DESC`
        ) || [];
    }

    async getAdminTimeAnalytics() {
        // Usage by hour of day (Cairo timezone UTC+2)
        const hourly = await this.many(
            `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Cairo')::int AS hour_cairo,
                    COUNT(*)::int AS event_count
             FROM analytics_events
             GROUP BY hour_cairo ORDER BY hour_cairo ASC`
        ) || [];

        // Usage by day of week (0 = Sunday, 6 = Saturday)
        const weekly = await this.many(
            `SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'Africa/Cairo')::int AS dow,
                    COUNT(*)::int AS event_count
             FROM analytics_events
             GROUP BY dow ORDER BY dow ASC`
        ) || [];

        return { hourly, weekly };
    }

    async getAdminRetention() {
        // DAU / WAU / MAU
        const dau = await this.one("SELECT COUNT(DISTINCT user_id)::int AS count FROM analytics_events WHERE created_at >= CURRENT_DATE") || { count: 0 };
        const wau = await this.one("SELECT COUNT(DISTINCT user_id)::int AS count FROM analytics_events WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'") || { count: 0 };
        const mau = await this.one("SELECT COUNT(DISTINCT user_id)::int AS count FROM analytics_events WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'") || { count: 0 };

        const dauMauRatio = mau.count > 0 ? Number(((dau.count / mau.count) * 100).toFixed(1)) : 0;

        return {
            dau: dau.count,
            wau: wau.count,
            mau: mau.count,
            dau_mau_ratio_percentage: dauMauRatio
        };
    }

    async getAdminSystemHealth() {
        const latestEvent = await this.one("SELECT event_type, created_at FROM analytics_events ORDER BY created_at DESC LIMIT 1");
        const eventsToday = await this.one("SELECT COUNT(*)::int AS count FROM analytics_events WHERE created_at >= CURRENT_DATE") || { count: 0 };
        const androidEvents = await this.one("SELECT COUNT(*)::int AS count FROM analytics_sessions WHERE platform = 'android' AND started_at >= CURRENT_DATE") || { count: 0 };
        const webEvents = await this.one("SELECT COUNT(*)::int AS count FROM analytics_sessions WHERE platform != 'android' AND started_at >= CURRENT_DATE") || { count: 0 };

        return {
            status: 'healthy',
            latest_event: latestEvent || null,
            events_today: eventsToday.count,
            android_sessions_today: androidEvents.count,
            web_sessions_today: webEvents.count,
            realtime_connected: true
        };
    }
}

function hasPostgresConfig() {
    return Boolean(POSTGRES_URL);
}

function createPostgresStore() {
    return hasPostgresConfig() ? new PostgresStore() : null;
}

module.exports = { PostgresStore, createPostgresStore, hasPostgresConfig, POSTGRES_SOURCE, diagnosePostgresConnection };
