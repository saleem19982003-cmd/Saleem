-- =============================================================
-- SALEEM Production Analytics & Supabase RLS Migration
-- Admin Authorized Email: saleem19982003@gmail.com
-- =============================================================

-- 1. ANALYTICS USERS TABLE
CREATE TABLE IF NOT EXISTS analytics_users (
    id TEXT PRIMARY KEY,
    auth_user_id TEXT,
    anonymous_id TEXT,
    display_name TEXT,
    country TEXT DEFAULT 'Other',
    preferred_language TEXT DEFAULT 'en',
    platform TEXT DEFAULT 'web', -- 'android', 'desktop_web', 'mobile_web'
    first_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. ANALYTICS SESSIONS TABLE
CREATE TABLE IF NOT EXISTS analytics_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    anonymous_id TEXT,
    platform TEXT DEFAULT 'web',
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. ANALYTICS EVENTS TABLE
CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT,
    anonymous_id TEXT,
    session_id TEXT,
    event_name TEXT NOT NULL,
    event_category TEXT DEFAULT 'general',
    page_or_screen TEXT,
    lesson_id INTEGER,
    quiz_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. LESSON PROGRESS TRACKING TABLE
CREATE TABLE IF NOT EXISTS lesson_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    lesson_id INTEGER NOT NULL,
    track TEXT DEFAULT 'dialect', -- 'dialect', 'culture'
    progress_percentage INTEGER DEFAULT 0,
    quiz_score INTEGER,
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_lesson_track UNIQUE (user_id, lesson_id, track)
);

-- 5. DAILY AGGREGATE TABLE (Optimized Analytics Cache)
CREATE TABLE IF NOT EXISTS analytics_daily (
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
);

-- =============================================================
-- PERFORMANCE INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_analytics_users_last_active ON analytics_users(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_users_platform ON analytics_users(platform);
CREATE INDEX IF NOT EXISTS idx_analytics_users_country ON analytics_users(country);
CREATE INDEX IF NOT EXISTS idx_analytics_users_lang ON analytics_users(preferred_language);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started ON analytics_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_activity ON analytics_sessions(last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_lesson ON analytics_events(lesson_id);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson ON lesson_progress(lesson_id, track);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_completed ON lesson_progress(completed_at);

-- =============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Admin Email: saleem19982003@gmail.com
-- =============================================================

-- Enable RLS on analytics tables
ALTER TABLE analytics_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;

-- Policy helper: Is Authorized Admin
-- Note: auth.jwt() ->> 'email' = 'saleem19982003@gmail.com'

-- 1. analytics_users
CREATE POLICY "Admin select analytics_users" ON analytics_users
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'email') = 'saleem19982003@gmail.com');

CREATE POLICY "Public insert analytics_users" ON analytics_users
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Public update self analytics_users" ON analytics_users
    FOR UPDATE TO anon, authenticated
    USING (id = (auth.jwt() ->> 'sub') OR (auth.jwt() ->> 'email') = 'saleem19982003@gmail.com')
    WITH CHECK (id = (auth.jwt() ->> 'sub') OR (auth.jwt() ->> 'email') = 'saleem19982003@gmail.com');

-- 2. analytics_sessions
CREATE POLICY "Admin select analytics_sessions" ON analytics_sessions
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'email') = 'saleem19982003@gmail.com');

CREATE POLICY "Public insert analytics_sessions" ON analytics_sessions
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Public update analytics_sessions" ON analytics_sessions
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. analytics_events
CREATE POLICY "Admin select analytics_events" ON analytics_events
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'email') = 'saleem19982003@gmail.com');

CREATE POLICY "Public insert analytics_events" ON analytics_events
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- 4. lesson_progress
CREATE POLICY "Admin select all lesson_progress" ON lesson_progress
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'email') = 'saleem19982003@gmail.com' OR user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users insert/update own lesson_progress" ON lesson_progress
    FOR ALL TO anon, authenticated
    USING (user_id = (auth.jwt() ->> 'sub') OR (auth.jwt() ->> 'email') = 'saleem19982003@gmail.com' OR user_id IS NOT NULL)
    WITH CHECK (user_id = (auth.jwt() ->> 'sub') OR (auth.jwt() ->> 'email') = 'saleem19982003@gmail.com' OR user_id IS NOT NULL);

-- 5. analytics_daily
CREATE POLICY "Admin select analytics_daily" ON analytics_daily
    FOR SELECT TO authenticated
    USING ((auth.jwt() ->> 'email') = 'saleem19982003@gmail.com');
