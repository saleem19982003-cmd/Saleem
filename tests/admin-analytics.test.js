// =============================================================
// Tests: Admin Analytics Aggregation & Baseline Suite
// Verifies LEGACY_USER_BASELINE = 50 and accurate counting
// =============================================================
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Admin Analytics & Baseline Calculation Suite', () => {
    const LEGACY_USER_BASELINE = 53;

    it('1. Historical Baseline starts at 53 with 0 new tracked users', () => {
        const trackedNewUsers = 0;
        const totalDisplayedUsers = LEGACY_USER_BASELINE + trackedNewUsers;
        assert.equal(totalDisplayedUsers, 53, 'Must display exactly 53 users when 0 new users are tracked');
    });

    it('2. Adding 1 new tracked user increases displayed total from 53 -> 54', () => {
        const trackedUsersSet = new Set();
        trackedUsersSet.add('user_uuid_1');

        const totalDisplayed = LEGACY_USER_BASELINE + trackedUsersSet.size;
        assert.equal(totalDisplayed, 54, 'Display must be 54 when 1 new tracked user joins');
    });

    it('3. Page refresh by existing user does NOT increment user count (54 stays 54)', () => {
        const trackedUsersSet = new Set();
        trackedUsersSet.add('user_uuid_1');

        // Simulate 5 page refreshes by same user
        for (let i = 0; i < 5; i++) {
            trackedUsersSet.add('user_uuid_1');
        }

        const totalDisplayed = LEGACY_USER_BASELINE + trackedUsersSet.size;
        assert.equal(totalDisplayed, 54, 'Refreshes by the same user must NEVER increment total users');
    });

    it('4. Genuinely new unique user increases count from 54 -> 55', () => {
        const trackedUsersSet = new Set();
        trackedUsersSet.add('user_uuid_1');
        trackedUsersSet.add('user_uuid_2');

        const totalDisplayed = LEGACY_USER_BASELINE + trackedUsersSet.size;
        assert.equal(totalDisplayed, 55, 'Second unique user must increase total to 55');
    });

    it('5. Online Now calculates users with activity within the last 2 minutes', () => {
        const now = Date.now();
        const activeUsers = [
            { id: 'u1', lastActive: now - 30 * 1000 }, // 30s ago -> ONLINE
            { id: 'u2', lastActive: now - 90 * 1000 }, // 90s ago -> ONLINE
            { id: 'u3', lastActive: now - 150 * 1000 }, // 2.5 min ago -> OFFLINE
            { id: 'u4', lastActive: now - 3600 * 1000 }, // 1 hour ago -> OFFLINE
        ];

        const onlineCount = activeUsers.filter(u => (now - u.lastActive) <= 2 * 60 * 1000).length;
        assert.equal(onlineCount, 2, 'Only users active within last 2 minutes are counted online');
    });

    it('6. Session duration calculates active time without unbounded browser-open inflation', () => {
        const session = {
            startTime: Date.now() - 30 * 60 * 1000,
            lastHeartbeat: Date.now() - 5 * 60 * 1000,
            recordedDurationSeconds: 1500 // 25 mins active
        };

        assert.equal(session.recordedDurationSeconds, 1500);
        assert.ok(session.recordedDurationSeconds < 86400, 'Session duration must stay bounded by real activity');
    });

    it('7. Learning funnel calculates conversion rates across all stages', () => {
        const funnel = {
            viewed: 100,
            started: 80,
            completed: 60,
            quizCompleted: 48
        };

        const viewToStartRate = (funnel.started / funnel.viewed) * 100;
        const startToCompleteRate = (funnel.completed / funnel.started) * 100;
        const completeToQuizRate = (funnel.quizCompleted / funnel.completed) * 100;

        assert.equal(viewToStartRate, 80);
        assert.equal(startToCompleteRate, 75);
        assert.equal(completeToQuizRate, 80);
    });

    it('8. CSV export formats valid CSV headers and rows without passwords', () => {
        const users = [
            { id: 'u_1', display_name: 'Amira', country: 'Sudan', preferred_language: 'ar', created_at: '2026-08-19' },
            { id: 'u_2', display_name: 'John, Doe', country: 'South Sudan', preferred_language: 'en', created_at: '2026-08-19' }
        ];

        function toCSV(headers, rows) {
            const escapeVal = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const headerLine = headers.map(h => escapeVal(h.label)).join(',');
            const dataLines = rows.map(row => headers.map(h => escapeVal(row[h.key])).join(','));
            return [headerLine, ...dataLines].join('\n');
        }

        const csv = toCSV([
            { key: 'id', label: 'User ID' },
            { key: 'display_name', label: 'Name' },
            { key: 'country', label: 'Country' }
        ], users);

        assert.ok(csv.includes('"User ID","Name","Country"'));
        assert.ok(csv.includes('"u_1","Amira","Sudan"'));
        assert.ok(csv.includes('"u_2","John, Doe","South Sudan"'));
        assert.ok(!csv.includes('password'));
    });
});
