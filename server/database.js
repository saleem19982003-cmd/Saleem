// =============================================================
// SALEEM Database Schema & Initialization
// SQLite via better-sqlite3 - optimized for 500-user pilot
// =============================================================
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

function initializeDatabase(dbPath) {
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    // Create all tables
    db.exec(`
        -- =============================================
        -- USERS
        -- =============================================
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            nationality TEXT DEFAULT 'Other',
            preferred_language TEXT DEFAULT 'en',
            role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'moderator')),
            onboarding_completed INTEGER DEFAULT 0,
            onboarding_preferences TEXT DEFAULT '[]',
            avatar_url TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            last_login_at TEXT,
            is_active INTEGER DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

        -- =============================================
        -- LESSONS & LEARNING CONTENT
        -- =============================================
        CREATE TABLE IF NOT EXISTS lesson_categories (
            id TEXT PRIMARY KEY,
            name_en TEXT NOT NULL,
            name_ar TEXT,
            description_en TEXT,
            description_ar TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS lessons (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            title_en TEXT NOT NULL,
            title_ar TEXT,
            description_en TEXT,
            description_ar TEXT,
            content_json TEXT NOT NULL DEFAULT '{}',
            difficulty TEXT DEFAULT 'beginner' CHECK(difficulty IN ('beginner', 'intermediate', 'advanced')),
            estimated_minutes INTEGER DEFAULT 10,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (category_id) REFERENCES lesson_categories(id)
        );
        CREATE INDEX IF NOT EXISTS idx_lessons_category ON lessons(category_id);
        CREATE INDEX IF NOT EXISTS idx_lessons_difficulty ON lessons(difficulty);

        CREATE TABLE IF NOT EXISTS vocabulary (
            id TEXT PRIMARY KEY,
            lesson_id TEXT,
            egyptian_arabic TEXT NOT NULL,
            transliteration TEXT,
            english TEXT NOT NULL,
            category TEXT,
            difficulty TEXT DEFAULT 'beginner',
            audio_url TEXT,
            usage_context TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (lesson_id) REFERENCES lessons(id)
        );
        CREATE INDEX IF NOT EXISTS idx_vocabulary_lesson ON vocabulary(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_vocabulary_category ON vocabulary(category);

        CREATE TABLE IF NOT EXISTS quiz_questions (
            id TEXT PRIMARY KEY,
            lesson_id TEXT NOT NULL,
            question_text TEXT NOT NULL,
            question_type TEXT DEFAULT 'multiple_choice' CHECK(question_type IN ('multiple_choice', 'fill_blank', 'translate', 'listen')),
            options_json TEXT DEFAULT '[]',
            correct_answer TEXT NOT NULL,
            explanation TEXT,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (lesson_id) REFERENCES lessons(id)
        );
        CREATE INDEX IF NOT EXISTS idx_quiz_lesson ON quiz_questions(lesson_id);

        -- =============================================
        -- USER PROGRESS
        -- =============================================
        CREATE TABLE IF NOT EXISTS user_progress (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            lesson_id TEXT NOT NULL,
            status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'completed')),
            score INTEGER DEFAULT 0,
            completed_at TEXT,
            started_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (lesson_id) REFERENCES lessons(id),
            UNIQUE(user_id, lesson_id)
        );
        CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);

        CREATE TABLE IF NOT EXISTS user_streaks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL UNIQUE,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_activity_date TEXT,
            total_words_learned INTEGER DEFAULT 0,
            total_phrases_mastered INTEGER DEFAULT 0,
            total_lessons_completed INTEGER DEFAULT 0,
            total_quizzes_completed INTEGER DEFAULT 0,
            level TEXT DEFAULT 'beginner' CHECK(level IN ('beginner', 'intermediate', 'advanced')),
            xp_points INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_streaks_user ON user_streaks(user_id);

        -- =============================================
        -- RESOURCES
        -- =============================================
        CREATE TABLE IF NOT EXISTS resources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL,
            location TEXT,
            city TEXT DEFAULT 'Cairo',
            address TEXT,
            phone TEXT,
            email TEXT,
            website TEXT,
            hours TEXT,
            languages TEXT DEFAULT 'Arabic, English',
            latitude REAL,
            longitude REAL,
            verification_status TEXT DEFAULT 'pending' CHECK(verification_status IN ('verified', 'pending', 'outdated', 'rejected')),
            verified_by TEXT,
            last_verified_at TEXT,
            required_documents TEXT DEFAULT '[]',
            useful_phrase TEXT,
            wait_time TEXT,
            services TEXT,
            is_demo_data INTEGER DEFAULT 0,
            source_name TEXT,
            source_url TEXT,
            source_checked_at TEXT,
            trust_note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (verified_by) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
        CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(verification_status);
        CREATE INDEX IF NOT EXISTS idx_resources_city ON resources(city);

        CREATE TABLE IF NOT EXISTS saved_resources (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            saved_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
            UNIQUE(user_id, resource_id)
        );

        -- =============================================
        -- EVENTS & COMMUNITY
        -- =============================================
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            category TEXT DEFAULT 'general',
            location TEXT,
            address TEXT,
            date TEXT NOT NULL,
            time TEXT,
            duration_minutes INTEGER,
            max_attendees INTEGER,
            organizer_id TEXT,
            organizer_name TEXT,
            status TEXT DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
            is_demo_data INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (organizer_id) REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
        CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

        CREATE TABLE IF NOT EXISTS event_registrations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            registered_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
            UNIQUE(user_id, event_id)
        );

        -- =============================================
        -- COMMUNITY POSTS & REPLIES
        -- =============================================
        CREATE TABLE IF NOT EXISTS community_posts (
            id TEXT PRIMARY KEY,
            author_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_nationality TEXT,
            title TEXT NOT NULL,
            body TEXT,
            category TEXT DEFAULT 'general',
            is_pinned INTEGER DEFAULT 0,
            is_moderated INTEGER DEFAULT 1,
            is_demo_data INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_posts_author ON community_posts(author_id);
        CREATE INDEX IF NOT EXISTS idx_posts_category ON community_posts(category);

        CREATE TABLE IF NOT EXISTS post_replies (
            id TEXT PRIMARY KEY,
            post_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_nationality TEXT,
            body TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_replies_post ON post_replies(post_id);

        -- =============================================
        -- REVIEWS
        -- =============================================
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            author_id TEXT NOT NULL,
            author_name TEXT NOT NULL,
            author_nationality TEXT,
            rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
            help_text TEXT NOT NULL,
            improvement_text TEXT,
            is_demo_data INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_reviews_author ON reviews(author_id);

        -- =============================================
        -- AI CHAT HISTORY
        -- =============================================
        CREATE TABLE IF NOT EXISTS chat_conversations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_user ON chat_conversations(user_id);

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat_messages(conversation_id);

        -- =============================================
        -- ANALYTICS (privacy-conscious)
        -- =============================================
        CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            event_type TEXT NOT NULL,
            event_data TEXT DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_events(created_at);

        -- =============================================
        -- TRANSLATION HISTORY
        -- =============================================
        CREATE TABLE IF NOT EXISTS translation_history (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            source_text TEXT NOT NULL,
            translated_text TEXT NOT NULL,
            source_lang TEXT,
            target_lang TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_translations_user ON translation_history(user_id);
    `);

    ensureColumn(db, 'resources', 'source_name', 'TEXT');
    ensureColumn(db, 'resources', 'source_url', 'TEXT');
    ensureColumn(db, 'resources', 'source_checked_at', 'TEXT');
    ensureColumn(db, 'resources', 'trust_note', 'TEXT');
    ensureColumn(db, 'community_posts', 'is_demo_data', 'INTEGER DEFAULT 0');
    ensureColumn(db, 'reviews', 'is_demo_data', 'INTEGER DEFAULT 0');

    return db;
}

function ensureColumn(db, tableName, columnName, columnType) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some(col => col.name === columnName)) {
        db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`).run();
    }
}

// Seed initial data
function seedDatabase(db) {
    const { v4: uuidv4 } = require('uuid');

    // Check if already seeded
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count > 0) {
        refreshVerifiedResourceData(db);
        console.log('Database already seeded, skipping...');
        return;
    }

    console.log('Seeding database with initial data...');

    // Create admin user
    const adminId = uuidv4();
    const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'SaleemAdmin2026!', 10);
    db.prepare(`
        INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role, onboarding_completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(adminId, process.env.ADMIN_EMAIL || 'admin@saleem.app', adminPasswordHash, 'Admin', 'Egypt', 'en', 'admin', 1);

    // Seed Lesson Categories
    const categories = [
        { id: 'cat-greetings', name_en: 'Greetings & Courtesy', name_ar: 'التحيات والأدب', icon: '👋', sort: 1 },
        { id: 'cat-transport', name_en: 'Transportation', name_ar: 'المواصلات', icon: '🚌', sort: 2 },
        { id: 'cat-shopping', name_en: 'Shopping & Markets', name_ar: 'التسوق والأسواق', icon: '🛒', sort: 3 },
        { id: 'cat-food', name_en: 'Food & Restaurants', name_ar: 'الطعام والمطاعم', icon: '🍽️', sort: 4 },
        { id: 'cat-health', name_en: 'Healthcare', name_ar: 'الرعاية الصحية', icon: '🏥', sort: 5 },
        { id: 'cat-work', name_en: 'Work & Employment', name_ar: 'العمل والتوظيف', icon: '💼', sort: 6 },
        { id: 'cat-school', name_en: 'School & Education', name_ar: 'المدرسة والتعليم', icon: '📚', sort: 7 },
        { id: 'cat-directions', name_en: 'Asking for Directions', name_ar: 'طلب الاتجاهات', icon: '🗺️', sort: 8 },
        { id: 'cat-daily', name_en: 'Everyday Conversations', name_ar: 'محادثات يومية', icon: '💬', sort: 9 },
        { id: 'cat-expressions', name_en: 'Egyptian Expressions', name_ar: 'تعبيرات مصرية', icon: '🇪🇬', sort: 10 },
        { id: 'cat-emergency', name_en: 'Emergency Situations', name_ar: 'حالات الطوارئ', icon: '🚨', sort: 11 },
        { id: 'cat-legal', name_en: 'Legal & Administrative', name_ar: 'القانونية والإدارية', icon: '⚖️', sort: 12 },
    ];

    const insertCategory = db.prepare(`
        INSERT INTO lesson_categories (id, name_en, name_ar, icon, sort_order) VALUES (?, ?, ?, ?, ?)
    `);
    categories.forEach(c => insertCategory.run(c.id, c.name_en, c.name_ar, c.icon, c.sort));

    // Seed Lessons with real content
    const insertLesson = db.prepare(`
        INSERT INTO lessons (id, category_id, title_en, title_ar, description_en, content_json, difficulty, estimated_minutes, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Greetings Lesson 1
    insertLesson.run('lesson-greetings-1', 'cat-greetings', 'Basic Greetings', 'التحيات الأساسية',
        'Learn essential Egyptian Arabic greetings for everyday interactions',
        JSON.stringify({
            sections: [
                {
                    title: 'Morning & Evening Greetings',
                    items: [
                        { egyptian: 'صباح الخير', transliteration: 'Sabah el-kheir', english: 'Good morning', context: 'Formal morning greeting' },
                        { egyptian: 'صباح الفل', transliteration: 'Sabah el-ful', english: 'Good morning (warm)', context: 'Friendly, means "morning of jasmine"' },
                        { egyptian: 'مساء الخير', transliteration: 'Masaa el-kheir', english: 'Good evening', context: 'Formal evening greeting' },
                        { egyptian: 'مساء القشطة', transliteration: 'Masaa el-qishta', english: 'Good evening (warm)', context: 'Friendly evening greeting' },
                    ]
                },
                {
                    title: 'How Are You?',
                    items: [
                        { egyptian: 'ازيك؟', transliteration: 'Ezzayak?', english: 'How are you? (to male)', context: 'Most common informal greeting' },
                        { egyptian: 'ازيك؟', transliteration: 'Ezzayek?', english: 'How are you? (to female)', context: 'Same word, slightly different pronunciation' },
                        { egyptian: 'عامل إيه؟', transliteration: 'Aamel eih?', english: 'How are you doing?', context: 'Very casual, among friends' },
                        { egyptian: 'الحمد لله تمام', transliteration: 'El-hamdu lillah tamam', english: "I'm fine, thanks to God", context: 'Standard positive response' },
                    ]
                }
            ]
        }),
        'beginner', 10, 1
    );

    // Transportation Lesson
    insertLesson.run('lesson-transport-1', 'cat-transport', 'Cairo Metro & Microbuses', 'مترو القاهرة والميكروباصات',
        'Navigate Cairo public transportation like a local',
        JSON.stringify({
            sections: [
                {
                    title: 'Metro Essentials',
                    items: [
                        { egyptian: 'فين أقرب محطة مترو؟', transliteration: 'Fein aqrab mahaTTat metro?', english: 'Where is the nearest metro station?', context: 'Essential question for getting around Cairo' },
                        { egyptian: 'عايز تذكرة للمترو', transliteration: 'Aayez tazkara lel-metro', english: 'I want a metro ticket', context: 'At the ticket booth' },
                        { egyptian: 'الخط الأول ولا التاني؟', transliteration: 'El-khaTT el-awwel walla el-taani?', english: 'Line 1 or Line 2?', context: 'Cairo Metro has 3 main lines' },
                        { egyptian: 'المحطة الجاية إيه؟', transliteration: 'El-mahaTTa el-gaya eih?', english: 'What is the next station?', context: 'Ask fellow passengers' },
                    ]
                },
                {
                    title: 'Microbus & Taxi',
                    items: [
                        { egyptian: 'على جنب يا اسطى', transliteration: 'Ala gamb ya osta', english: 'Drop me off here, driver', context: 'Standard microbus stop request' },
                        { egyptian: 'الميكروباص ده رايح فين؟', transliteration: 'El-microbus da raayeH fein?', english: 'Where is this microbus going?', context: 'Ask before boarding' },
                        { egyptian: 'شغل العداد يا فندم', transliteration: 'Shaggal el-addaad ya fandim', english: 'Turn on the meter, sir', context: 'Important for taxis to avoid overcharging' },
                    ]
                }
            ]
        }),
        'beginner', 15, 1
    );

    // Shopping Lesson
    insertLesson.run('lesson-shopping-1', 'cat-shopping', 'Market Bargaining', 'المساومة في السوق',
        'Master the art of Egyptian market negotiation',
        JSON.stringify({
            sections: [
                {
                    title: 'Price Asking & Bargaining',
                    items: [
                        { egyptian: 'بكام ده يا باشا؟', transliteration: 'Bikam da ya basha?', english: 'How much is this, sir?', context: 'Polite way to ask price' },
                        { egyptian: 'غالي قوي', transliteration: 'Ghaali awi', english: 'Too expensive!', context: 'Standard bargaining opener' },
                        { egyptian: 'آخر كلام كام؟', transliteration: 'Aakhir kalaam kam?', english: 'What is your best final price?', context: 'Shows you are serious about buying' },
                        { egyptian: 'لا مش هينفع بالسعر ده', transliteration: 'La mesh hayenfa3 bel-se3r da', english: "No, that price won't work", context: 'Walking away often gets you a better price' },
                    ]
                }
            ]
        }),
        'intermediate', 12, 1
    );

    // Seed Quiz Questions
    const insertQuiz = db.prepare(`
        INSERT INTO quiz_questions (id, lesson_id, question_text, question_type, options_json, correct_answer, explanation, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertQuiz.run('quiz-g1-1', 'lesson-greetings-1', 'What does "صباح الفل" mean?', 'multiple_choice',
        JSON.stringify(['Good night', 'Good morning (warm)', 'Goodbye', 'Thank you']),
        'Good morning (warm)', 'Literally means "morning of jasmine" - a warm, friendly greeting', 1);
    insertQuiz.run('quiz-g1-2', 'lesson-greetings-1', 'How do you ask "How are you?" to a male friend in Egyptian Arabic?', 'multiple_choice',
        JSON.stringify(['شكراً', 'ازيك؟', 'مع السلامة', 'يلا']),
        'ازيك؟', 'Ezzayak (ازيك) is the most common informal greeting in Egypt', 2);
    insertQuiz.run('quiz-g1-3', 'lesson-greetings-1', 'Translate to Egyptian Arabic: "I\'m fine, thanks to God"', 'translate',
        JSON.stringify([]), 'الحمد لله تمام', 'El-hamdu lillah tamam - the standard positive response', 3);

    insertQuiz.run('quiz-t1-1', 'lesson-transport-1', 'What should you say to stop a microbus?', 'multiple_choice',
        JSON.stringify(['يلا بينا', 'على جنب يا اسطى', 'صباح الخير', 'بكام ده؟']),
        'على جنب يا اسطى', 'Ala gamb ya osta - means "to the side, driver" - the standard stop signal', 1);

    insertQuiz.run('quiz-s1-1', 'lesson-shopping-1', 'What does "آخر كلام كام؟" mean?', 'multiple_choice',
        JSON.stringify(['Where is the market?', 'What is your final price?', 'Can I pay later?', 'Do you have change?']),
        'What is your final price?', 'This phrase shows the seller you are serious and want their best offer', 1);

    // Seed Resources (marked as demo data)
    const insertResource = db.prepare(`
        INSERT INTO resources (id, name, description, category, address, city, phone, hours, languages, latitude, longitude, verification_status, required_documents, useful_phrase, wait_time, services, is_demo_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertResource.run('res-1', 'UNHCR Main Refugee Registration Center',
        'Primary UNHCR registration and protection office for refugees in Egypt',
        'legal', '17 Mecca El-Mokarrama Street, 7th District, 6th of October City', 'Giza',
        '+20 2 2728 4300', 'Sun-Thu: 8:00 AM - 3:00 PM',
        'Arabic, English, Oromo, Somali, Tigrinya, French',
        29.9744, 30.9575, 'verified',
        JSON.stringify(['Valid Passport/Travel ID', '4 Passport Photos', 'Egyptian Phone Number', 'Original Lease Agreement']),
        'عندي معاد في المفوضية تجديد كارت أصفر', '45-90 mins',
        'Yellow Card Registration, Protection, Asylum Processing', 1);

    insertResource.run('res-2', 'Passports & Immigration Authority (Abbasiya)',
        'Government immigration office for residency permits and visa extensions',
        'legal', 'El-Abbasiya Square, Cairo Governorate', 'Cairo',
        '+20 2 2684 0404', 'Sun-Thu: 8:30 AM - 2:00 PM',
        'Arabic, English',
        30.0715, 31.2825, 'verified',
        JSON.stringify(['UNHCR Yellow Card', 'Passport Copy', '4 Photos', 'Stamped Rental Lease']),
        'عايز أجدد الإقامة كارت أصفر', '60-120 mins',
        'Residency Permits, Visa Extensions, Stamped Passports', 1);

    insertResource.run('res-3', 'Egyptian Red Crescent Health Center',
        'Free primary healthcare and emergency services for refugees',
        'healthcare', 'Zahraa El Maadi, Cairo Governorate', 'Cairo',
        '19963 / +20 2 2519 2831', 'Daily 24/7 Emergency Clinic',
        'Arabic, English, French',
        29.9792, 31.2875, 'verified',
        JSON.stringify(['UNHCR Yellow Card or Passport ID']),
        'محتاج تكشف على طفلي طوارئ', '15-30 mins',
        'Free Primary Care, Maternal Health, Pediatrics, Emergency Triage', 1);

    insertResource.run('res-4', "St. Andrew's Refugee Services (StARS)",
        'Free legal aid, language classes, and social services for refugees',
        'legal', '38 26th of July Street, Downtown Cairo', 'Cairo',
        '+20 2 2575 9451', 'Sun-Thu: 9:00 AM - 4:00 PM',
        'Arabic, English, Amharic, Oromo, Somali, Tigrinya',
        30.0535, 31.2415, 'verified',
        JSON.stringify(['UNHCR File Number', 'Identity Card']),
        'عايز استشارة قانونية من مجاني StARS', '30-60 mins',
        'Free Legal Aid, Refugee Status Appeal, Language Classes', 1);

    insertResource.run('res-5', 'Caritas Egypt Medical & Social Center',
        'Medical subsidies, social assistance, and vulnerability grants',
        'healthcare', 'Road 9, Maadi, Cairo Governorate', 'Cairo',
        '+20 2 2358 2901', 'Sun-Thu: 8:30 AM - 3:00 PM',
        'Arabic, English, French',
        29.9615, 31.2575, 'verified',
        JSON.stringify(['UNHCR Card & Doctor Referral']),
        'عندي تحويل طبي كاريتاس', '30 mins',
        'Medical Subsidies, Social Assistance, Vulnerability Grants', 1);

    // Seed Events (demo data)
    const insertEvent = db.prepare(`
        INSERT INTO events (id, title, description, category, location, address, date, time, duration_minutes, max_attendees, organizer_name, status, is_demo_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertEvent.run('evt-1', 'Egyptian Arabic Language Exchange',
        'Practice Egyptian dialect with local volunteers. All levels welcome!',
        'language', 'StARS Downtown', '38 26th of July Street, Downtown Cairo',
        '2026-08-15', '16:00', 120, 30, 'StARS Organization', 'upcoming', 1);

    insertEvent.run('evt-2', 'UNHCR Yellow Card Renewal Workshop',
        'Step-by-step guidance for yellow card renewal process and documentation',
        'legal', 'Community Center, 6th of October', '6th of October City',
        '2026-08-20', '10:00', 90, 50, 'UNHCR Egypt', 'upcoming', 1);

    insertEvent.run('evt-3', 'Cairo Cultural Walking Tour',
        'Guided tour of Islamic Cairo and Khan El-Khalili market with cultural explanations',
        'culture', 'Khan El-Khalili', 'El-Gamaleya, Cairo',
        '2026-08-22', '09:00', 180, 20, 'Saleem Community', 'upcoming', 1);

    refreshVerifiedResourceData(db);
    console.log('Database seeded successfully!');
}

function refreshVerifiedResourceData(db) {
    const verifiedAt = '2026-08-11';
    const rows = [
        {
            id: 'res-1',
            name: 'UNHCR Egypt Reception Centre',
            description: 'UNHCR Egypt reception centre for scheduled registration, document renewal, protection and counselling appointments. UNHCR states services are free of charge and appointments are required for many services.',
            category: 'legal',
            address: '17 Mecca El-Mokarrama Street, 7th District, 6th of October City',
            city: 'Giza',
            phone: '0231330000',
            hours: 'Infoline Sun-Wed 08:15-15:30; Thu 08:15-14:00. Office hours can change; verify before visiting.',
            languages: 'Arabic, English and partner-supported languages vary by service',
            latitude: 29.9597,
            longitude: 30.9369,
            required_documents: JSON.stringify(['Appointment details from UNHCR when applicable', 'UNHCR case number or identity document', 'Passport or available identity documents']),
            useful_phrase: 'I have a UNHCR appointment and need help with my file.',
            wait_time: 'Appointment-based; queues vary',
            services: 'Registration appointments, document renewal guidance, protection counselling, MyUNHCR portal support',
            source_name: 'UNHCR Egypt Contact Us and Registration pages',
            source_url: 'https://help.unhcr.org/egypt/en/contacts/',
            trust_note: 'Official UNHCR Egypt source. Users should verify current appointment rules before travel.'
        },
        {
            id: 'res-4',
            name: "St. Andrew's Refugee Services (StARS)",
            description: 'Refugee service organization offering legal aid, education, psychosocial and child protection services. UNHCR partner information states services are free of charge.',
            category: 'legal',
            address: '38 26th of July Street, Esaaf Square, Downtown Cairo',
            city: 'Cairo',
            phone: '+20 2 2575 9451',
            hours: 'Sun-Thu 09:00-17:00 for many services; call the relevant infoline first.',
            languages: 'Arabic, English, Amharic, Oromo, Somali, Tigrinya and others depending on service',
            latitude: 30.0535,
            longitude: 31.2415,
            required_documents: JSON.stringify(['UNHCR file number if available', 'Identity card or available identity document', 'Any appointment or case documents']),
            useful_phrase: 'I need a free legal counselling appointment.',
            wait_time: 'Call first; appointment availability varies',
            services: 'Legal counselling, refugee status support, education, psychosocial support, child protection',
            source_name: 'StARS official website and UNHCR Egypt partner page',
            source_url: 'https://stars-egypt.org/',
            trust_note: 'Official StARS and UNHCR partner source. Phone lines and intake windows can change.'
        },
        {
            id: 'res-5',
            name: 'Caritas Egypt Refugee Support',
            description: 'Caritas Egypt refugee program provides counselling and follow-up plus medical services, vocational training, subsistence allowance and emergency grants through UNHCR programs.',
            category: 'healthcare',
            address: 'Caritas Egypt refugee services offices in Greater Cairo',
            city: 'Cairo',
            phone: '(02)27961771 / (02)2964441',
            hours: 'Call before visiting; service windows vary by program.',
            languages: 'Arabic, English, French depending on program',
            latitude: 30.0444,
            longitude: 31.2357,
            required_documents: JSON.stringify(['UNHCR card or case number if available', 'Medical reports or referral documents for health support', 'Identity documents']),
            useful_phrase: 'I need information about refugee medical or social assistance.',
            wait_time: 'Call first; appointment availability varies',
            services: 'Medical services, counselling, vocational training, emergency grants, financial assistance programs',
            source_name: 'Caritas Egypt Refugees page',
            source_url: 'https://caritas-egypt.org/en/immigrants/',
            trust_note: 'Official Caritas Egypt source. Exact office and intake details should be confirmed by phone.'
        }
    ];

    const upsert = db.prepare(`
        INSERT INTO resources (
            id, name, description, category, address, city, phone, hours, languages,
            latitude, longitude, verification_status, required_documents, useful_phrase,
            wait_time, services, is_demo_data, source_name, source_url, source_checked_at,
            trust_note, updated_at
        )
        VALUES (
            @id, @name, @description, @category, @address, @city, @phone, @hours, @languages,
            @latitude, @longitude, 'verified', @required_documents, @useful_phrase,
            @wait_time, @services, 0, @source_name, @source_url, @source_checked_at,
            @trust_note, datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            category = excluded.category,
            address = excluded.address,
            city = excluded.city,
            phone = excluded.phone,
            hours = excluded.hours,
            languages = excluded.languages,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            verification_status = 'verified',
            required_documents = excluded.required_documents,
            useful_phrase = excluded.useful_phrase,
            wait_time = excluded.wait_time,
            services = excluded.services,
            is_demo_data = 0,
            source_name = excluded.source_name,
            source_url = excluded.source_url,
            source_checked_at = excluded.source_checked_at,
            trust_note = excluded.trust_note,
            updated_at = datetime('now')
    `);

    rows.forEach(row => upsert.run({ ...row, source_checked_at: verifiedAt }));

    db.prepare(`
        UPDATE community_posts
        SET is_demo_data = 1
        WHERE author_name IN ('Amina Hassan', 'Tariq Al-Bashir', 'Rahma Tesfaye')
           OR title LIKE '%UNHCR in 6th of October%'
           OR title LIKE '%Yellow Card%'
    `).run();

    db.prepare(`
        UPDATE reviews
        SET is_demo_data = 1
        WHERE author_name IN ('Amina Hassan', 'Tariq Al-Bashir', 'Rahma Tesfaye')
    `).run();
}

module.exports = { initializeDatabase, seedDatabase };
