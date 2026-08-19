// =============================================================
// Admin Routes & Aggregated Intelligence Dashboard
// Strictly restricted to saleem19982003@gmail.com
// =============================================================
const express = require('express');
const router = express.Router();
const { requireAdminEmail } = require('../middleware/auth');

const LEGACY_USER_BASELINE = 50;

// All routes in this router require verified administrator authentication
router.use(requireAdminEmail);

// Helper for CSV formatting with formula injection protection
function toCSV(headers, rows) {
    const escapeVal = (v) => {
        if (v === null || v === undefined) return '""';
        let str = String(v);
        // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
        if (/^[=+\-@\t\r]/.test(str)) {
            str = "'" + str;
        }
        str = str.replace(/"/g, '""');
        return `"${str}"`;
    };
    const headerLine = headers.map(h => escapeVal(h.label)).join(',');
    const dataLines = rows.map(row => headers.map(h => escapeVal(row[h.key])).join(','));
    return [headerLine, ...dataLines].join('\n');
}

// 1. GET /api/admin/overview
router.get('/overview', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminOverview === 'function') {
            const data = await durableDb.getAdminOverview(req.query.range || '7d');
            return res.json(data);
        }

        // SQLite Fallback
        const usersCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user' OR role IS NULL").get()?.c || 0;
        const onlineCount = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM analytics_sessions WHERE last_activity_at >= datetime('now', '-2 minutes')").get()?.c || 0;
        const activeToday = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= date('now')").get()?.c || 0;
        const active7d = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= date('now', '-7 days')").get()?.c || 0;
        const active30d = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= date('now', '-30 days')").get()?.c || 0;
        const visitorsToday = db.prepare("SELECT COUNT(DISTINCT COALESCE(user_id, anonymous_id)) as c FROM analytics_sessions WHERE started_at >= date('now')").get()?.c || 0;
        const sessionsToday = db.prepare("SELECT COUNT(*) as c FROM analytics_sessions WHERE started_at >= date('now')").get()?.c || 0;

        const lessonsStarted = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'lesson_started'").get()?.c || 0;
        const lessonsCompleted = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'lesson_completed'").get()?.c || 0;
        const compRate = lessonsStarted > 0 ? Number(((lessonsCompleted / lessonsStarted) * 100).toFixed(1)) : 0;

        const durationRow = db.prepare("SELECT AVG(duration_seconds) as avg_d, SUM(duration_seconds) as sum_d FROM analytics_sessions WHERE duration_seconds > 0").get() || {};
        const platforms = db.prepare("SELECT COALESCE(platform, 'web') as platform, COUNT(*) as count FROM analytics_sessions GROUP BY platform").all();

        res.json({
            baseline: {
                historical_baseline: LEGACY_USER_BASELINE,
                tracked_users: usersCount,
                total_displayed_users: LEGACY_USER_BASELINE + usersCount
            },
            activity: {
                online_now: onlineCount,
                active_today: activeToday,
                active_last_7_days: active7d,
                active_last_30_days: active30d,
                visitors_today: visitorsToday,
                sessions_today: sessionsToday
            },
            learning: {
                lessons_started: lessonsStarted,
                lessons_completed: lessonsCompleted,
                completion_rate_percentage: compRate,
                total_learning_seconds: durationRow.sum_d || 0,
                average_session_duration_seconds: Math.round(durationRow.avg_d || 0)
            },
            platforms: platforms
        });
    } catch (err) {
        console.error('Admin overview error:', err);
        res.status(500).json({ error: 'Failed to load admin overview.' });
    }
});

// 2. GET /api/admin/live
router.get('/live', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminLiveUsers === 'function') {
            const data = await durableDb.getAdminLiveUsers();
            return res.json(data);
        }

        const onlineCount = db.prepare("SELECT COUNT(DISTINCT COALESCE(user_id, anonymous_id)) as c FROM analytics_sessions WHERE last_activity_at >= datetime('now', '-2 minutes')").get()?.c || 0;
        const activeSessions = db.prepare(`
            SELECT s.id as session_id, s.user_id, s.anonymous_id, s.platform, s.duration_seconds, s.last_activity_at,
                   u.name as display_name, u.nationality as country, u.preferred_language
            FROM analytics_sessions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.last_activity_at >= datetime('now', '-30 minutes')
            ORDER BY s.last_activity_at DESC LIMIT 50
        `).all();

        const recentEvents = db.prepare(`
            SELECT e.id, e.user_id, e.event_type, e.event_category, e.page_or_screen, e.lesson_id, e.created_at,
                   u.name as display_name, u.nationality as country
            FROM analytics_events e
            LEFT JOIN users u ON e.user_id = u.id
            ORDER BY e.created_at DESC LIMIT 25
        `).all();

        res.json({
            online_now: onlineCount,
            active_sessions: activeSessions,
            recent_activity: recentEvents
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load live data.' });
    }
});

// 3. GET /api/admin/growth
router.get('/growth', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;
        const range = req.query.range || '30d';

        if (durableDb && typeof durableDb.getAdminUserGrowth === 'function') {
            const data = await durableDb.getAdminUserGrowth(range);
            return res.json(data);
        }

        const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
        const rows = db.prepare(`
            SELECT date(created_at) as date, COUNT(*) as new_users
            FROM users
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date(created_at)
            ORDER BY date(created_at) ASC
        `).all(days);

        let cumulative = LEGACY_USER_BASELINE;
        const growth = rows.map(r => {
            cumulative += r.new_users;
            return {
                date: r.date,
                new_users: r.new_users,
                cumulative_tracked: cumulative - LEGACY_USER_BASELINE,
                cumulative_displayed: cumulative
            };
        });

        res.json({ baseline: LEGACY_USER_BASELINE, growth });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load growth data.' });
    }
});

// 4. GET /api/admin/traffic
router.get('/traffic', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const range = req.query.range || '7d';
        const days = range === 'today' ? 1 : range === '30d' ? 30 : 7;

        const traffic = db.prepare(`
            SELECT date(created_at) as date,
                   COUNT(DISTINCT session_id) as sessions,
                   COUNT(DISTINCT COALESCE(user_id, anonymous_id)) as unique_visitors,
                   COUNT(*) as page_views
            FROM analytics_events
            WHERE created_at >= datetime('now', '-' || ? || ' days')
            GROUP BY date(created_at)
            ORDER BY date(created_at) ASC
        `).all(days);

        res.json({ traffic });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load traffic data.' });
    }
});

// 5. GET /api/admin/learning
router.get('/learning', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminLearningAnalytics === 'function') {
            const data = await durableDb.getAdminLearningAnalytics();
            return res.json(data);
        }

        const views = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'lesson_viewed'").get()?.c || 0;
        const starts = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'lesson_started'").get()?.c || 0;
        const comps = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'lesson_completed'").get()?.c || 0;
        const quizzes = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'quiz_completed'").get()?.c || 0;

        const mostCompleted = db.prepare(`
            SELECT lesson_id, COUNT(*) as completions
            FROM analytics_events
            WHERE event_type = 'lesson_completed' AND lesson_id IS NOT NULL
            GROUP BY lesson_id ORDER BY completions DESC LIMIT 10
        `).all();

        res.json({
            funnel: {
                viewed: views,
                started: starts,
                completed: comps,
                quiz_completed: quizzes
            },
            most_completed: mostCompleted,
            most_abandoned: []
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load learning data.' });
    }
});

// 6. GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;
        const { page = 1, limit = 50, search = '', country = '', lang = '', platform = '' } = req.query;

        if (durableDb && typeof durableDb.getAdminUsersList === 'function') {
            const data = await durableDb.getAdminUsersList({
                page, limit, search, filterCountry: country, filterLang: lang, filterPlatform: platform
            });
            return res.json(data);
        }

        let query = "SELECT id, email, name as display_name, nationality as country, preferred_language, created_at, last_login_at FROM users WHERE (role = 'user' OR role IS NULL)";
        const params = [];

        if (search) {
            query += " AND (name LIKE ? OR email LIKE ? OR id LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (country) {
            query += " AND nationality = ?";
            params.push(country);
        }
        if (lang) {
            query += " AND preferred_language = ?";
            params.push(lang);
        }

        const total = db.prepare(`SELECT COUNT(*) as c FROM (${query})`).get(...params)?.c || 0;

        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit, 10), offset);

        const users = db.prepare(query).all(...params).map(u => ({
            ...u,
            lessons_completed: 0,
            session_count: 1,
            total_duration_seconds: 0,
            status: 'offline'
        }));

        res.json({ users, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load users.' });
    }
});

// 7. GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;
        const userId = req.params.id;

        if (durableDb && typeof durableDb.getAdminUserDetails === 'function') {
            const data = await durableDb.getAdminUserDetails(userId);
            if (!data) return res.status(404).json({ error: 'User not found.' });
            return res.json(data);
        }

        const user = db.prepare('SELECT id, email, name as display_name, nationality as country, preferred_language, created_at, last_login_at FROM users WHERE id = ?').get(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const timeline = db.prepare('SELECT event_type, event_category, page_or_screen, lesson_id, created_at FROM analytics_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId);
        const completed = db.prepare("SELECT lesson_id, score, started_at, completed_at FROM user_progress WHERE user_id = ? AND status = 'completed'").all(userId);
        const sessions = db.prepare('SELECT id, platform, started_at, duration_seconds FROM analytics_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20').all(userId);

        res.json({ user, timeline, completed_lessons: completed, sessions });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load user details.' });
    }
});

// 8. GET /api/admin/countries
router.get('/countries', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminCountryStats === 'function') {
            const data = await durableDb.getAdminCountryStats();
            return res.json(data);
        }

        const countries = db.prepare("SELECT COALESCE(nationality, 'Other') as country, COUNT(*) as user_count FROM users WHERE role = 'user' OR role IS NULL GROUP BY nationality ORDER BY user_count DESC").all();
        res.json(countries);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load countries.' });
    }
});

// 9. GET /api/admin/languages
router.get('/languages', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminLanguageStats === 'function') {
            const data = await durableDb.getAdminLanguageStats();
            return res.json(data);
        }

        const langs = db.prepare("SELECT COALESCE(preferred_language, 'en') as language, COUNT(*) as user_count FROM users WHERE role = 'user' OR role IS NULL GROUP BY preferred_language ORDER BY user_count DESC").all();
        res.json(langs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load languages.' });
    }
});

// 10. GET /api/admin/platforms
router.get('/platforms', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminPlatformStats === 'function') {
            const data = await durableDb.getAdminPlatformStats();
            return res.json(data);
        }

        const platforms = db.prepare("SELECT COALESCE(platform, 'web') as platform, COUNT(*) as session_count, AVG(duration_seconds) as avg_duration_seconds FROM analytics_sessions GROUP BY platform").all();
        res.json(platforms);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load platforms.' });
    }
});

// 11. GET /api/admin/time
router.get('/time', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminTimeAnalytics === 'function') {
            const data = await durableDb.getAdminTimeAnalytics();
            return res.json(data);
        }

        const hourly = db.prepare("SELECT strftime('%H', created_at) as hour_cairo, COUNT(*) as event_count FROM analytics_events GROUP BY hour_cairo ORDER BY hour_cairo ASC").all();
        const weekly = db.prepare("SELECT strftime('%w', created_at) as dow, COUNT(*) as event_count FROM analytics_events GROUP BY dow ORDER BY dow ASC").all();
        res.json({ hourly, weekly });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load time data.' });
    }
});

// 12. GET /api/admin/retention
router.get('/retention', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminRetention === 'function') {
            const data = await durableDb.getAdminRetention();
            return res.json(data);
        }

        const dau = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= date('now')").get()?.c || 0;
        const wau = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= date('now', '-7 days')").get()?.c || 0;
        const mau = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM analytics_events WHERE created_at >= date('now', '-30 days')").get()?.c || 0;
        const ratio = mau > 0 ? Number(((dau / mau) * 100).toFixed(1)) : 0;

        res.json({ dau, wau, mau, dau_mau_ratio_percentage: ratio });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load retention data.' });
    }
});

// 13. GET /api/admin/system
router.get('/system', async (req, res) => {
    try {
        const durableDb = req.app.locals.userDb;
        const db = req.app.locals.db;

        if (durableDb && typeof durableDb.getAdminSystemHealth === 'function') {
            const data = await durableDb.getAdminSystemHealth();
            return res.json(data);
        }

        const latest = db.prepare('SELECT event_type, created_at FROM analytics_events ORDER BY created_at DESC LIMIT 1').get();
        const countToday = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE created_at >= date('now')").get()?.c || 0;
        const androidToday = db.prepare("SELECT COUNT(*) as c FROM analytics_sessions WHERE platform = 'android' AND started_at >= date('now')").get()?.c || 0;
        const webToday = db.prepare("SELECT COUNT(*) as c FROM analytics_sessions WHERE platform != 'android' AND started_at >= date('now')").get()?.c || 0;

        res.json({
            status: 'healthy',
            latest_event: latest || null,
            events_today: countToday,
            android_sessions_today: androidToday,
            web_sessions_today: webToday,
            realtime_connected: true
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load system health.' });
    }
});

// 14. GET /api/admin/export/:type - Export data as CSV
router.get('/export/:type', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const type = req.params.type;

        let csvData = '';
        let filename = `saleem_export_${type}_${new Date().toISOString().split('T')[0]}.csv`;

        if (type === 'users') {
            const users = db.prepare("SELECT id, name as display_name, nationality as country, preferred_language, created_at, last_login_at FROM users WHERE role = 'user' OR role IS NULL").all();
            csvData = toCSV([
                { key: 'id', label: 'User ID' },
                { key: 'display_name', label: 'Display Name' },
                { key: 'country', label: 'Country' },
                { key: 'preferred_language', label: 'Language' },
                { key: 'created_at', label: 'Created At' },
                { key: 'last_login_at', label: 'Last Login' }
            ], users);
        } else if (type === 'lessons') {
            const lessons = db.prepare("SELECT lesson_id, COUNT(*) as completions FROM analytics_events WHERE event_type = 'lesson_completed' GROUP BY lesson_id ORDER BY completions DESC").all();
            csvData = toCSV([
                { key: 'lesson_id', label: 'Lesson ID' },
                { key: 'completions', label: 'Completions' }
            ], lessons);
        } else if (type === 'sessions') {
            const sessions = db.prepare('SELECT id, user_id, platform, started_at, duration_seconds FROM analytics_sessions ORDER BY started_at DESC LIMIT 500').all();
            csvData = toCSV([
                { key: 'id', label: 'Session ID' },
                { key: 'user_id', label: 'User ID' },
                { key: 'platform', label: 'Platform' },
                { key: 'started_at', label: 'Started At' },
                { key: 'duration_seconds', label: 'Duration (s)' }
            ], sessions);
        } else {
            return res.status(400).json({ error: 'Invalid export type.' });
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvData);
    } catch (err) {
        res.status(500).json({ error: 'Export failed.' });
    }
});

module.exports = router;
