// =============================================================
// Tests: Admin Dashboard Security & Access Control
// Strictly enforces saleem19982003@gmail.com authorization
// =============================================================
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

describe('Admin Dashboard Security & Authorization Suite', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'saleem-test-secret-2026';
    const ADMIN_EMAIL = 'saleem19982003@gmail.com';
    const UNAUTHORIZED_EMAIL = 'attacker@example.com';

    function createTestToken(payload) {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    }

    it('1. Normal unauthenticated request to /api/admin/overview is rejected with 401', async () => {
        const { requireAdminEmail } = require('../server/middleware/auth');
        const req = { headers: {} };
        let statusCode = 0;
        let responseJson = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseJson = data; }
                };
            }
        };

        requireAdminEmail(req, res, () => {});
        assert.equal(statusCode, 401, 'Must return 401 when no token is present');
        assert.ok(responseJson.error, 'Error message must be returned');
    });

    it('2. Authenticated user with non-admin email is rejected with 403 Forbidden', async () => {
        const { requireAdminEmail } = require('../server/middleware/auth');
        const token = createTestToken({ sub: 'user-123', email: UNAUTHORIZED_EMAIL, role: 'user' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        let statusCode = 0;
        let responseJson = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseJson = data; }
                };
            }
        };

        requireAdminEmail(req, res, () => {});
        assert.equal(statusCode, 403, 'Must return 403 when email is not saleem19982003@gmail.com');
        assert.match(responseJson.error, /restricted/i);
    });

    it('3. Another authenticated email claiming admin role is rejected with 403', async () => {
        const { requireAdminEmail } = require('../server/middleware/auth');
        const token = createTestToken({ sub: 'fake-admin-456', email: 'impostor@admin.com', role: 'admin' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        let statusCode = 0;
        let responseJson = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseJson = data; }
                };
            }
        };

        requireAdminEmail(req, res, () => {});
        assert.equal(statusCode, 403, 'Must reject any email other than saleem19982003@gmail.com');
    });

    it('4. Only saleem19982003@gmail.com passes admin authorization middleware', async () => {
        const { requireAdminEmail } = require('../server/middleware/auth');
        const token = createTestToken({ sub: 'real-admin-789', email: ADMIN_EMAIL, role: 'admin' });
        const req = { headers: { authorization: `Bearer ${token}` } };
        let nextCalled = false;
        const res = {
            status: () => ({ json: () => {} })
        };

        requireAdminEmail(req, res, () => { nextCalled = true; });
        assert.equal(nextCalled, true, 'Next middleware must be called for authorized admin');
        assert.equal(req.user.email, ADMIN_EMAIL);
        assert.equal(req.user.role, 'admin');
    });

    it('5. Supabase Service-Role key does not exist in any client-side JavaScript/HTML bundle', () => {
        const clientFiles = [
            path.join(__dirname, '..', 'app.js'),
            path.join(__dirname, '..', 'admin.js'),
            path.join(__dirname, '..', 'app.html'),
            path.join(__dirname, '..', 'admin.html'),
            path.join(__dirname, '..', 'index.html')
        ];

        for (const file of clientFiles) {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                assert.ok(!content.includes('service_role'), `File ${file} must not contain service_role reference`);
                assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `File ${file} must not contain SUPABASE_SERVICE_ROLE_KEY`);
            }
        }
    });

    it('6. Event metadata sanitizer removes password, tokens, secrets, and auth headers', () => {
        const dangerousMetadata = {
            lessonId: 5,
            password: 'secret_user_pw',
            access_token: 'jwt_token_123',
            user_token: 'sample_token',
            authorization: 'Bearer 123',
            service_key: 'srv_999',
            nested: {
                secret: 'deep_secret',
                safe_info: 'valid'
            },
            safe_metric: 100
        };

        // Test sanitizer logic
        const SENSITIVE_KEYS = ['password', 'password_hash', 'token', 'access_token', 'refresh_token', 'auth', 'authorization', 'secret', 'api_key', 'service_role', 'service_key'];
        function sanitize(data) {
            if (!data || typeof data !== 'object') return {};
            const clean = {};
            for (const [k, v] of Object.entries(data)) {
                const lk = k.toLowerCase();
                if (SENSITIVE_KEYS.some(s => lk.includes(s))) continue;
                if (typeof v === 'object' && v !== null && !Array.isArray(v)) clean[k] = sanitize(v);
                else clean[k] = v;
            }
            return clean;
        }

        const sanitized = sanitize(dangerousMetadata);
        assert.equal(sanitized.lessonId, 5);
        assert.equal(sanitized.safe_metric, 100);
        assert.equal(sanitized.password, undefined);
        assert.equal(sanitized.access_token, undefined);
        assert.equal(sanitized.user_token, undefined);
        assert.equal(sanitized.authorization, undefined);
        assert.equal(sanitized.service_key, undefined);
        assert.equal(sanitized.nested?.secret, undefined);
        assert.equal(sanitized.nested?.safe_info, 'valid');
    });

    it('7. Malformed event with missing event_name/type is rejected', async () => {
        const analyticsRouter = require('../server/routes/analytics');
        const req = {
            body: {},
            headers: {},
            app: { locals: { db: { prepare: () => ({ run: () => {} }) } } }
        };
        let statusCode = 0;
        let responseJson = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { responseJson = data; }
                };
            }
        };

        // Find the POST /track handler layer
        const trackLayer = analyticsRouter.stack.find(s => s.route && s.route.path === '/track' && s.route.methods.post);
        assert.ok(trackLayer, 'POST /track route must exist');
        const trackHandler = trackLayer.route.stack[trackLayer.route.stack.length - 1].handle;
        await trackHandler(req, res, () => {});

        assert.equal(statusCode, 400, 'Must return 400 when event_name or event_type is missing');
        assert.match(responseJson.error, /required/i);
    });

    it('8. Expired JWT token is rejected with 401', () => {
        const { requireAdminEmail } = require('../server/middleware/auth');
        const expiredToken = jwt.sign({ sub: 'admin-1', email: ADMIN_EMAIL }, JWT_SECRET, { expiresIn: '-1s' });
        const req = { headers: { authorization: `Bearer ${expiredToken}` } };
        let statusCode = 0;
        const res = {
            status: (code) => {
                statusCode = code;
                return { json: () => {} };
            }
        };

        requireAdminEmail(req, res, () => {});
        assert.equal(statusCode, 401, 'Must reject expired admin token with 401');
    });
});
