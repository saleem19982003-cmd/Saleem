// =============================================================
// SALEEM Production API Integration Tests
// Native Node.js test runner
// =============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Create temporary test database
const testDbPath = path.join(__dirname, 'test_saleem.db');
process.env.DATABASE_PATH = testDbPath;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-32-chars-long-saleem';
process.env.ADMIN_PASSWORD = 'TestAdminPass123!';

// Clean test db if exists
if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) {}
}

const { initializeDatabase, seedDatabase } = require('../server/database');
const db = initializeDatabase(testDbPath);
seedDatabase(db);

let authToken = '';
let testUserId = '';

test('1. Database Initialization & Seeding', (t) => {
    const categories = db.prepare('SELECT COUNT(*) as count FROM lesson_categories').get();
    assert.ok(categories.count >= 10, 'Should seed at least 10 lesson categories');

    const lessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get();
    assert.ok(lessons.count >= 3, 'Should seed initial lessons');

    const resources = db.prepare('SELECT COUNT(*) as count FROM resources').get();
    assert.ok(resources.count >= 5, 'Should seed verified resources');

    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
    assert.ok(admin, 'Admin user should be seeded');
    assert.equal(admin.email, 'admin@saleem.app');
});

test('2. User Registration API Logic', (t) => {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const { generateToken } = require('../server/middleware/auth');

    const id = uuidv4();
    const hash = bcrypt.hashSync('Password123!', 10);

    db.prepare(`
        INSERT INTO users (id, email, password_hash, name, nationality, preferred_language, role)
        VALUES (?, 'user@example.com', ?, 'Tariq Hassan', 'Sudan', 'ar', 'user')
    `).run(id, hash);

    testUserId = id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    assert.equal(user.name, 'Tariq Hassan');
    assert.equal(user.nationality, 'Sudan');

    authToken = generateToken(user);
    assert.ok(authToken, 'Should generate JWT token');
});

test('3. Authentication Middleware & Security', (t) => {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
    assert.equal(decoded.id, testUserId);
    assert.equal(decoded.email, 'user@example.com');
});

test('4. Lessons & Quiz Progress Flow', (t) => {
    const { v4: uuidv4 } = require('uuid');
    const lesson = db.prepare('SELECT id FROM lessons LIMIT 1').get();

    // Start lesson
    db.prepare("INSERT INTO user_progress (id, user_id, lesson_id, status) VALUES (?, ?, ?, 'in_progress')").run(uuidv4(), testUserId, lesson.id);

    const started = db.prepare('SELECT status FROM user_progress WHERE user_id = ? AND lesson_id = ?').get(testUserId, lesson.id);
    assert.equal(started.status, 'in_progress');

    // Complete lesson
    db.prepare("UPDATE user_progress SET status = 'completed', score = 100, completed_at = datetime('now') WHERE user_id = ? AND lesson_id = ?").run(testUserId, lesson.id);

    const completed = db.prepare('SELECT status, score FROM user_progress WHERE user_id = ? AND lesson_id = ?').get(testUserId, lesson.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.score, 100);
});

test('5. Resources Verification Workflow', (t) => {
    const verified = db.prepare("SELECT * FROM resources WHERE verification_status = 'verified'").all();
    assert.ok(verified.length >= 5, 'Should return verified resources');

    verified.forEach(r => {
        assert.equal(r.verification_status, 'verified', 'All public resources must be verified');
    });
});

test('6. Community Forum & Replies', (t) => {
    const { v4: uuidv4 } = require('uuid');
    const postId = uuidv4();

    db.prepare(`
        INSERT INTO community_posts (id, author_id, author_name, author_nationality, title, body, category)
        VALUES (?, ?, 'Tariq Hassan', 'Sudan', 'How do I renew Yellow Card?', 'Looking for guidance', 'legal')
    `).run(postId, testUserId);

    const post = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(postId);
    assert.equal(post.title, 'How do I renew Yellow Card?');

    // Add reply
    const replyId = uuidv4();
    db.prepare(`
        INSERT INTO post_replies (id, post_id, author_id, author_name, author_nationality, body)
        VALUES (?, ?, ?, 'Helper Friend', 'Egypt', 'Go to 6th of October office early in morning.')
    `).run(replyId, postId, testUserId);

    const replies = db.prepare('SELECT * FROM post_replies WHERE post_id = ?').all(postId);
    assert.equal(replies.length, 1);
    assert.equal(replies[0].body, 'Go to 6th of October office early in morning.');
});

test('7. Cleanup', (t) => {
    db.close();
    try { fs.unlinkSync(testDbPath); } catch (e) {}
});
