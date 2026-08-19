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

describe('Anonymous Auth: Multi-Refresh Session Persistence Verification', () => {
    // Simulates the exact browser localStorage and Supabase auth session restoration across 5 page reloads
    class MockBrowserStorage {
        constructor() {
            this.store = new Map();
        }
        getItem(key) { return this.store.get(key) || null; }
        setItem(key, val) { this.store.set(key, String(val)); }
        removeItem(key) { this.store.delete(key); }
        clear() { this.store.clear(); }
    }

    // Mock client simulating Supabase JS v2 with persistent session storage
    class MockSupabaseClient {
        constructor(storage, storageKey) {
            this.storage = storage;
            this.storageKey = storageKey;
            this.createdAccounts = 0;
            this.auth = {
                getSession: async () => {
                    const raw = this.storage.getItem(this.storageKey);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        return { data: { session: parsed } };
                    }
                    return { data: { session: null } };
                },
                getUser: async () => {
                    const raw = this.storage.getItem(this.storageKey);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        return { data: { user: parsed.user } };
                    }
                    return { data: { user: null } };
                },
                signInAnonymously: async () => {
                    this.createdAccounts++;
                    const newUid = 'supabase-anon-persisted-' + Math.random().toString(36).substring(2, 12);
                    const session = {
                        access_token: 'mock-access-token-' + newUid,
                        refresh_token: 'mock-refresh-token-' + newUid,
                        user: { id: newUid, is_anonymous: true }
                    };
                    this.storage.setItem(this.storageKey, JSON.stringify(session));
                    return { data: { user: session.user, session } };
                }
            };
        }
    }

    // Logic simulating ensureAuthenticatedUser()
    async function simulateEnsureAuthenticatedUser(storage, sb) {
        const storageKey = 'saleem_supabase_auth_session';
        const { data: sessionData } = await sb.auth.getSession();
        if (sessionData?.session?.user?.id) {
            const uid = sessionData.session.user.id;
            storage.setItem('saleem_supabase_uid', uid);
            return { uid, source: 'supabase' };
        }
        const { data: userData } = await sb.auth.getUser().catch(() => ({ data: {} }));
        if (userData?.user?.id) {
            const uid = userData.user.id;
            storage.setItem('saleem_supabase_uid', uid);
            return { uid, source: 'supabase' };
        }
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        const uid = data.user.id;
        storage.setItem('saleem_supabase_uid', uid);
        return { uid, source: 'supabase' };
    }

    it('should retain exactly the same auth.user.id across initial load and 5 consecutive refreshes', async () => {
        const browserStorage = new MockBrowserStorage();
        const storageKey = 'saleem_supabase_auth_session';

        // Load 0 (Initial signup)
        const sbInstance0 = new MockSupabaseClient(browserStorage, storageKey);
        const initialAuth = await simulateEnsureAuthenticatedUser(browserStorage, sbInstance0);
        const initialUid = initialAuth.uid;
        assert.ok(initialUid, 'Initial load must generate an Auth UUID');
        assert.equal(sbInstance0.createdAccounts, 1, 'Initial load must create exactly 1 anonymous account');

        // Register profile on backend
        const regRes = await request('POST', '/api/auth/register-anon', {
            supabase_uid: initialUid,
            name: 'Persistence User',
            nationality: 'Egypt',
            preferred_language: 'ar',
        });
        assert.equal(regRes.status, 201);
        assert.equal(regRes.data.user.id, initialUid, 'public.users.id must equal initial Auth UID');

        // Refresh 1
        const sbInstance1 = new MockSupabaseClient(browserStorage, storageKey);
        const refresh1 = await simulateEnsureAuthenticatedUser(browserStorage, sbInstance1);
        assert.equal(refresh1.uid, initialUid, 'Refresh 1 must retain initial Auth UID');
        assert.equal(sbInstance1.createdAccounts, 0, 'Refresh 1 must NOT create a new anonymous account');

        // Refresh 2
        const sbInstance2 = new MockSupabaseClient(browserStorage, storageKey);
        const refresh2 = await simulateEnsureAuthenticatedUser(browserStorage, sbInstance2);
        assert.equal(refresh2.uid, initialUid, 'Refresh 2 must retain initial Auth UID');
        assert.equal(sbInstance2.createdAccounts, 0, 'Refresh 2 must NOT create a new anonymous account');

        // Refresh 3
        const sbInstance3 = new MockSupabaseClient(browserStorage, storageKey);
        const refresh3 = await simulateEnsureAuthenticatedUser(browserStorage, sbInstance3);
        assert.equal(refresh3.uid, initialUid, 'Refresh 3 must retain initial Auth UID');
        assert.equal(sbInstance3.createdAccounts, 0, 'Refresh 3 must NOT create a new anonymous account');

        // Refresh 4
        const sbInstance4 = new MockSupabaseClient(browserStorage, storageKey);
        const refresh4 = await simulateEnsureAuthenticatedUser(browserStorage, sbInstance4);
        assert.equal(refresh4.uid, initialUid, 'Refresh 4 must retain initial Auth UID');
        assert.equal(sbInstance4.createdAccounts, 0, 'Refresh 4 must NOT create a new anonymous account');

        // Refresh 5
        const sbInstance5 = new MockSupabaseClient(browserStorage, storageKey);
        const refresh5 = await simulateEnsureAuthenticatedUser(browserStorage, sbInstance5);
        assert.equal(refresh5.uid, initialUid, 'Refresh 5 must retain initial Auth UID');
        assert.equal(sbInstance5.createdAccounts, 0, 'Refresh 5 must NOT create a new anonymous account');

        // Total accounts created across initial load and 5 reloads must remain 1
        assert.equal(initialAuth.uid, refresh1.uid);
        assert.equal(initialAuth.uid, refresh2.uid);
        assert.equal(initialAuth.uid, refresh3.uid);
        assert.equal(initialAuth.uid, refresh4.uid);
        assert.equal(initialAuth.uid, refresh5.uid);
    });

    it('should retain the same Auth UID during migration retry without creating additional anonymous users', async () => {
        const browserStorage = new MockBrowserStorage();
        const storageKey = 'saleem_supabase_auth_session';
        const legacyId = 'SLM-retry-' + Date.now();

        // 1. Setup legacy user on server
        await request('POST', '/api/auth/register-anon', {
            supabase_uid: legacyId,
            name: 'Retry Migration User',
            nationality: 'Somalia',
            preferred_language: 'so',
        });

        // 2. Browser resolves Auth UID
        const sb = new MockSupabaseClient(browserStorage, storageKey);
        const authResult = await simulateEnsureAuthenticatedUser(browserStorage, sb);
        const persistentUid = authResult.uid;

        // 3. First migration attempt succeeds and binds legacy data to persistent Auth UID
        const migRes = await request('POST', '/api/auth/migrate-identity', {
            old_user_id: legacyId,
            new_user_id: persistentUid,
        });
        assert.equal(migRes.status, 200);
        assert.equal(migRes.data.user.id, persistentUid, 'public.users.id must be migrated to Auth UUID');

        // 4. Reload page after migration
        const sbReload = new MockSupabaseClient(browserStorage, storageKey);
        const reloadAuth = await simulateEnsureAuthenticatedUser(browserStorage, sbReload);
        assert.equal(reloadAuth.uid, persistentUid, 'Reloaded Auth UID must be identical');
        assert.equal(sbReload.createdAccounts, 0, 'No extra account created on reload');
    });
});
