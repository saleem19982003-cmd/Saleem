const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'local-auth-test-secret';
const { authenticateToken } = require('../server/middleware/auth');

function authenticate(token) {
    let nextCalled = false;
    let response = null;
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {}};
    const res = { status(code) { return { json(body) { response = { code, body }; } }; } };
    authenticateToken(req, res, () => { nextCalled = true; });
    return { nextCalled, response };
}

test('JWT rejects missing, malformed, expired, and wrongly signed tokens', () => {
    assert.equal(authenticate(null).response.code, 401);
    assert.equal(authenticate('not-a-jwt').response.code, 403);

    const expired = jwt.sign({ id: 'expired-user' }, process.env.JWT_SECRET, { expiresIn: -1 });
    assert.equal(authenticate(expired).response.code, 403);

    const valid = jwt.sign({ id: 'signed-user' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const invalidSignature = `${valid.slice(0, -1)}x`;
    assert.equal(authenticate(invalidSignature).response.code, 403);
    assert.equal(authenticate(valid).nextCalled, true);
});

test('JWT middleware has no source fallback secret', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server', 'middleware', 'auth.js'), 'utf8');
    assert.match(source, /process\.env\.JWT_SECRET/);
    assert.doesNotMatch(source, /JWT_SECRET\s*=\s*process\.env\.JWT_SECRET\s*\|\|\s*['"][^'"]+['"]/);
});
