const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCategory, haversineKm, resourceDistance } = require('../server/routes/resources');

test('resource categories normalize to supported public categories', () => {
    assert.equal(normalizeCategory('pharmacies'), 'pharmacy');
    assert.equal(normalizeCategory('refugee-support'), 'refugee_support');
    assert.equal(normalizeCategory('schools'), 'education');
    assert.equal(normalizeCategory('government'), 'government');
});

test('resource distance uses Haversine and returns null without coordinates', () => {
    assert.ok(haversineKm(30.0444, 31.2357, 30.0535, 31.2415) > 1);
    assert.equal(resourceDistance({ latitude: null, longitude: null }, 30, 31), null);
    assert.equal(resourceDistance({ latitude: 30, longitude: 31 }, null, 31), null);
});
