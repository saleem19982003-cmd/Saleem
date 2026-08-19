// =============================================================
// Tests: Supabase Anonymous Authentication Endpoints
// =============================================================
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Set test environment before importing the app
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-anon-auth-tests-2026';
process.env.PORT = '0';

const app = require('../server/index');

// Lightweight test HTTP client
async function request(method, path, body = null, headers = {}) {
    const { createServer } = require('http');
    return new Promise((resolve, reject) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            const url = `http://127.0.0.1:${port}${path}`;
            const options = {
                method,
                headers: { 'Content-Type': 'application/json', ...headers },
                body: body ? JSON.stringify(body) : undefined,
            };
            fetch(url, options)
                .then(async res => {
                    const data = await res.json().catch(() => ({}));
                    server.close();
                    resolve({ status: res.status, data });
                })
                .catch(err => { server.close(); reject(err); });
        });
    });
}

describe('Anonymous Auth: POST /api/auth/register-anon', () => {
    const testUid = 'test-supabase-uid-' + Date.now();

    it('should register a new anonymous user with valid data', async () => {
        const res = await request('POST', '/api/auth/register-anon', {
            supabase_uid: testUid,
            name: 'Test Anon User',
            nationality: 'Sudan',
            preferred_language: 'ar',
        });
        assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
        assert.ok(res.data.token, 'Should return a JWT token');
        assert.ok(res.data.user, 'Should return user object');
        assert.equal(res.data.user.id, testUid, 'User ID should match Supabase UID');
        assert.equal(res.data.user.name, 'Test Anon User');
        assert.equal(res.data.user.nationality, 'Sudan');
    });

    it('should handle duplicate registration (upsert)', async () => {
        const res = await request('POST', '/api/auth/register-anon', {
            supabase_uid: testUid,
            name: 'Updated Name',
            nationality: 'Egypt',
            preferred_language: 'en',
        });
        // Should succeed (upsert behavior)
        assert.equal(res.status, 201);
        assert.ok(res.data.token);
    });

    it('should reject missing supabase_uid', async () => {
        const res = await request('POST', '/api/auth/register-anon', {
            name: 'No UID User',
            nationality: 'Egypt',
        });
        assert.equal(res.status, 400);
        assert.ok(res.data.error);
    });

    it('should reject missing name', async () => {
        const res = await request('POST', '/api/auth/register-anon', {
            supabase_uid: 'another-test-uid-1234567890',
        });
        assert.equal(res.status, 400);
        assert.ok(res.data.error);
    });

    it('should reject short supabase_uid', async () => {
        const res = await request('POST', '/api/auth/register-anon', {
            supabase_uid: 'short',
            name: 'Test',
        });
        assert.equal(res.status, 400);
    });
});

describe('Anonymous Auth: POST /api/auth/migrate-identity', () => {
    const legacyId = 'SLM-' + Date.now();
    const newId = 'supabase-new-uid-' + Date.now();

    // First register the legacy user
    before(async () => {
        await request('POST', '/api/auth/register-anon', {
            supabase_uid: legacyId,
            name: 'Legacy User',
            nationality: 'Ethiopia',
            preferred_language: 'am',
        });
    });

    it('should migrate a legacy user to a new Supabase UID and match auth.users.id = public.users.id', async () => {
        const res = await request('POST', '/api/auth/migrate-identity', {
            old_user_id: legacyId,
            new_user_id: newId,
        });
        assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
        assert.ok(res.data.token, 'Should return a new JWT token');
        assert.ok(res.data.migrated, 'Should indicate migration happened');
        assert.equal(res.data.user.id, newId, 'Public user ID must equal the new Auth UUID');
        assert.equal(res.data.user.name, 'Legacy User');
    });

    it('should support /auth/migrate-identity reverse proxy alias', async () => {
        const testOld = 'SLM-alias-' + Date.now();
        const testNew = 'supabase-alias-uid-' + Date.now();
        await request('POST', '/api/auth/register-anon', {
            supabase_uid: testOld,
            name: 'Alias User',
            nationality: 'Sudan',
            preferred_language: 'ar',
        });
        const res = await request('POST', '/auth/migrate-identity', {
            old_user_id: testOld,
            new_user_id: testNew,
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.user.id, testNew);
    });

    it('should reject migration with non-existent old_user_id', async () => {
        const res = await request('POST', '/api/auth/migrate-identity', {
            old_user_id: 'nonexistent-user-id-9999',
            new_user_id: 'some-new-uid-1234567890',
        });
        assert.equal(res.status, 404);
        assert.ok(res.data.error);
    });

    it('should reject migration with same old and new IDs', async () => {
        const res = await request('POST', '/api/auth/migrate-identity', {
            old_user_id: 'same-id-test-1234567890',
            new_user_id: 'same-id-test-1234567890',
        });
        assert.equal(res.status, 400);
    });

    it('should reject migration with missing fields', async () => {
        const res = await request('POST', '/api/auth/migrate-identity', {
            old_user_id: 'only-old-id',
        });
        assert.equal(res.status, 400);
    });
});

describe('Anonymous Auth: GET /api/config/public', () => {
    it('should return Supabase config (possibly null if not configured)', async () => {
        const res = await request('GET', '/api/config/public');
        assert.equal(res.status, 200);
        assert.ok('supabase_url' in res.data, 'Should contain supabase_url key');
        assert.ok('supabase_anon_key' in res.data, 'Should contain supabase_anon_key key');
    });

    it('should NOT expose service role key or secrets', async () => {
        const res = await request('GET', '/api/config/public');
        const keys = Object.keys(res.data);
        for (const key of keys) {
            assert.ok(!key.includes('service_role'), `Should not expose ${key}`);
            assert.ok(!key.includes('secret'), `Should not expose ${key}`);
            assert.ok(!key.includes('password'), `Should not expose ${key}`);
        }
    });
});

describe('Anonymous Auth: Security Checks', () => {
    it('password_hash should not be returned in register-anon response', async () => {
        const res = await request('POST', '/api/auth/register-anon', {
            supabase_uid: 'security-check-uid-' + Date.now(),
            name: 'Security Check',
            nationality: 'Other',
        });
        assert.equal(res.status, 201);
        assert.ok(!res.data.user.password_hash, 'password_hash must not be in response');
    });

    it('authenticated profile should not expose password_hash', async () => {
        // Register first to get a token
        const regRes = await request('POST', '/api/auth/register-anon', {
            supabase_uid: 'profile-security-uid-' + Date.now(),
            name: 'Profile Security',
            nationality: 'Other',
        });
        const token = regRes.data.token;

        const profileRes = await request('GET', '/api/auth/me', null, {
            Authorization: `Bearer ${token}`,
        });
        assert.equal(profileRes.status, 200);
        assert.ok(!profileRes.data.user?.password_hash, 'password_hash must not be in profile response');
    });
});
