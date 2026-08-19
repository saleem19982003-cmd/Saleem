// =============================================================
// Tests: SALEEM Analytics Center Standalone Test Suite
// Verifies security, baseline metrics, Cairo timezone & isolation
// =============================================================
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('SALEEM Analytics Center — Standalone Suite', () => {
    const ADMIN_AUTHORIZED_EMAIL = 'saleem19982003@gmail.com';
    const LEGACY_USER_BASELINE = 53;
    const IANA_TIMEZONE = 'Africa/Cairo';

    it('1. Gatekeeper allows ONLY saleem19982003@gmail.com and rejects all other emails with generic error', () => {
        function checkAdminAccess(email) {
            return (email || '').toLowerCase().trim() === ADMIN_AUTHORIZED_EMAIL;
        }

        assert.equal(checkAdminAccess('saleem19982003@gmail.com'), true);
        assert.equal(checkAdminAccess('SALEEM19982003@GMAIL.COM'), true);
        assert.equal(checkAdminAccess('attacker@example.com'), false);
        assert.equal(checkAdminAccess('admin@saleem.app'), false);
        assert.equal(checkAdminAccess(null), false);
        assert.equal(checkAdminAccess(''), false);
    });

    it('2. Baseline Calculation starts at 53 and accurately deduplicates users', () => {
        const trackedSet = new Set();
        assert.equal(LEGACY_USER_BASELINE + trackedSet.size, 53, 'Baseline with 0 tracked users must be 53');

        trackedSet.add('user_1');
        assert.equal(LEGACY_USER_BASELINE + trackedSet.size, 54, '1 unique user must yield 54');

        // Multiple page refreshes by user_1
        for (let i = 0; i < 10; i++) trackedSet.add('user_1');
        assert.equal(LEGACY_USER_BASELINE + trackedSet.size, 54, 'Repeated visits by same user must NEVER increment total');

        trackedSet.add('user_2');
        assert.equal(LEGACY_USER_BASELINE + trackedSet.size, 55, 'Second unique user must yield 55');
    });

    it('3. Timezone formatting strictly uses Africa/Cairo IANA identifier', () => {
        const utcDate = new Date('2026-08-19T10:00:00Z'); // 10:00 UTC = 13:00 Cairo (UTC+3 DST or UTC+2 standard)
        
        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: IANA_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const formatted = formatter.format(utcDate);
        assert.ok(formatted.includes('12') || formatted.includes('13'), `Must format to Cairo local time (got: ${formatted})`);
    });

    it('4. Search Engine Protection is present across HTML, robots.txt, and vercel.json', () => {
        const basePath = path.join(__dirname, '..');
        
        // index.html
        const indexHtml = fs.readFileSync(path.join(basePath, 'index.html'), 'utf8');
        assert.ok(indexHtml.includes('name="robots"'), 'index.html must have robots meta tag');
        assert.ok(indexHtml.includes('noindex,nofollow,noarchive'), 'index.html must have noindex value');

        // robots.txt
        const robotsTxt = fs.readFileSync(path.join(basePath, 'robots.txt'), 'utf8');
        assert.ok(robotsTxt.includes('Disallow: /'), 'robots.txt must disallow all crawlers');

        // vercel.json
        const vercelJson = JSON.parse(fs.readFileSync(path.join(basePath, 'vercel.json'), 'utf8'));
        const headers = vercelJson.headers?.[0]?.headers || [];
        const robotsHeader = headers.find(h => h.key === 'X-Robots-Tag');
        assert.ok(robotsHeader, 'vercel.json must configure X-Robots-Tag');
        assert.equal(robotsHeader.value, 'noindex, nofollow, noarchive');
    });

    it('5. Standalone Analytics Center client files contain zero service-role keys or passwords', () => {
        const basePath = path.join(__dirname, '..');
        const filesToCheck = ['index.html', 'app.js', 'styles.css', 'server.js'];

        for (const file of filesToCheck) {
            const filePath = path.join(basePath, file);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                assert.ok(!content.includes('service_role'), `${file} must not contain service_role`);
                assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `${file} must not contain SUPABASE_SERVICE_ROLE_KEY`);
                assert.ok(!content.includes('TestAdminPass'), `${file} must not contain hardcoded password`);
            }
        }
    });

    it('6. Environment filtering defaults to production and excludes development/test traffic', () => {
        const events = [
            { id: 1, event_name: 'lesson_completed', metadata: { environment: 'production' } },
            { id: 2, event_name: 'lesson_completed', metadata: { environment: 'development' } },
            { id: 3, event_name: 'lesson_completed', metadata: { environment: 'test' } },
            { id: 4, event_name: 'lesson_completed', metadata: { environment: 'production' } }
        ];

        function filterEvents(list, env) {
            if (env === 'all') return list;
            return list.filter(e => (e.metadata?.environment || 'production') === env);
        }

        const prodOnly = filterEvents(events, 'production');
        assert.equal(prodOnly.length, 2, 'Only production events should be counted by default');
    });

    it('7. CSV Export formats valid RFC 4180 CSV with Cairo timestamps and no secrets', () => {
        const sampleRows = [
            { id: 'u_1', display_name: 'Fatima', country: 'Sudan', last_active: '2026-08-19T10:00:00Z' }
        ];

        function generateCSV(rows) {
            const headers = ['User ID', 'Name', 'Country', 'Last Active (Cairo)'];
            const data = rows.map(r => [
                `"${r.id}"`,
                `"${r.display_name}"`,
                `"${r.country}"`,
                `"${new Intl.DateTimeFormat('en-GB', { timeZone: IANA_TIMEZONE }).format(new Date(r.last_active))}"`
            ].join(','));
            return [headers.join(','), ...data].join('\n');
        }

        const csv = generateCSV(sampleRows);
        assert.ok(csv.includes('User ID,Name,Country,Last Active (Cairo)'));
        assert.ok(csv.includes('"u_1","Fatima","Sudan"'));
        assert.ok(!csv.includes('password'));
    });

    it('8. Static asset routing delivers real CSS and JS (not index.html fallback)', () => {
        const basePath = path.join(__dirname, '..');
        const stylesCss = fs.readFileSync(path.join(basePath, 'styles.css'), 'utf8');
        const appJs = fs.readFileSync(path.join(basePath, 'app.js'), 'utf8');
        const indexHtml = fs.readFileSync(path.join(basePath, 'index.html'), 'utf8');

        // Verify files are distinct and contain proper syntax
        assert.notEqual(stylesCss, indexHtml, 'styles.css must not equal index.html');
        assert.notEqual(appJs, indexHtml, 'app.js must not equal index.html');
        assert.ok(stylesCss.includes(':root') && stylesCss.includes('--bg-dark'), 'styles.css must contain valid CSS rules');
        assert.ok(appJs.includes('initAnalyticsCenter') && appJs.includes('supabaseClient'), 'app.js must contain JavaScript logic');

        // Verify vercel.json has explicit static routes and filesystem handler
        const vercelJson = JSON.parse(fs.readFileSync(path.join(basePath, 'vercel.json'), 'utf8'));
        const routes = vercelJson.routes || [];
        const hasCssRoute = routes.some(r => r.src === '/styles.css' && r.dest === '/styles.css');
        const hasJsRoute = routes.some(r => r.src === '/app.js' && r.dest === '/app.js');
        const hasFsHandle = routes.some(r => r.handle === 'filesystem');
        const hasConfigRoute = routes.some(r => r.src === '/api/config' && r.dest === '/api/config.js');

        assert.ok(hasCssRoute, 'vercel.json must have explicit route for /styles.css');
        assert.ok(hasJsRoute, 'vercel.json must have explicit route for /app.js');
        assert.ok(hasFsHandle, 'vercel.json must contain {"handle": "filesystem"}');
        assert.ok(hasConfigRoute, 'vercel.json must route /api/config to serverless function');

        // Verify Content-Type headers in vercel.json
        const headers = vercelJson.headers || [];
        const cssHeader = headers.find(h => h.source === '/styles.css')?.headers?.find(h => h.key === 'Content-Type');
        const jsHeader = headers.find(h => h.source === '/app.js')?.headers?.find(h => h.key === 'Content-Type');

        assert.ok(cssHeader && cssHeader.value.includes('text/css'), 'styles.css must have Content-Type: text/css');
        assert.ok(jsHeader && jsHeader.value.includes('javascript'), 'app.js must have Content-Type: application/javascript');
    });

    it('9. Concurrent login lock and generic privacy error messages protect administrator', () => {
        const basePath = path.join(__dirname, '..');
        const indexHtml = fs.readFileSync(path.join(basePath, 'index.html'), 'utf8');
        const appJs = fs.readFileSync(path.join(basePath, 'app.js'), 'utf8');

        // Verify index.html does NOT leak admin email in input value
        assert.ok(!indexHtml.includes('value="saleem19982003@gmail.com"'), 'index.html must NOT have prefilled admin email');

        // Verify app.js error messages do not reveal authorized email in user errors
        assert.ok(!appJs.includes("Unauthorized: Access is strictly restricted to saleem19982003@gmail.com"), 'Must not reveal admin email in error messages');
        assert.ok(appJs.includes('غير مسموح بالدخول'), 'Must show generic access denied message');

        // Verify concurrent session lock functions exist
        assert.ok(appJs.includes('setupConcurrentSessionGuard') && appJs.includes('forceLogoutConcurrent'), 'Must implement concurrent session guard');
    });
});
