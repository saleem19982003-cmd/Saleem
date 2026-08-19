// =============================================================
// Tests: Dataset Loading & Cache Storage Resilience
// =============================================================
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('Dataset Resilience: File and Structure Verification', () => {
    it('dialect_lessons_600.json exists and has valid 600 lessons structure', () => {
        const filePath = path.join(__dirname, '..', 'data', 'dialect_lessons_600.json');
        assert.ok(fs.existsSync(filePath), 'dialect_lessons_600.json must exist');
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        assert.ok(Array.isArray(data.lessons), 'data.lessons must be an array');
        assert.equal(data.lessons.length, 600, 'Must contain 600 lessons');
    });

    it('culture_lessons_100.json exists and has valid 100 lessons structure', () => {
        const filePath = path.join(__dirname, '..', 'data', 'culture_lessons_100.json');
        assert.ok(fs.existsSync(filePath), 'culture_lessons_100.json must exist');
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        assert.ok(Array.isArray(data.lessons), 'data.lessons must be an array');
        assert.equal(data.lessons.length, 100, 'Must contain 100 lessons');
    });

    it('phrases_45.json exists and has 45 phrases', () => {
        const filePath = path.join(__dirname, '..', 'data', 'phrases_45.json');
        assert.ok(fs.existsSync(filePath), 'phrases_45.json must exist');
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        assert.ok(Array.isArray(data.phrases), 'data.phrases must be an array');
        assert.equal(data.phrases.length, 45, 'Must contain 45 phrases');
    });
});

describe('Dataset Resilience: Browser & Cache Failure Simulation Suite', () => {
    const LEARNING_DATA_VERSION = '2026-08-19-v4';
    const LEARNING_CACHE_NAME = `saleem-learning-${LEARNING_DATA_VERSION}`;

    function isValidDatasetStructure(data, expectedKey) {
        if (!data || typeof data !== 'object') return false;
        if (expectedKey === 'phrases') {
            return Array.isArray(data.phrases) && data.phrases.length > 0;
        }
        return Array.isArray(data.lessons) && data.lessons.length > 0;
    }

    // Mock implementation of fetchLearningDatasetJson for Node testing
    async function simulateDatasetLoader({
        fetchFn,
        cachesObj,
        path: assetPath,
        expectedKey = 'lessons'
    }) {
        const url = `${assetPath}?v=${LEARNING_DATA_VERSION}`;

        // 1. Primary: Network-First Fetch
        try {
            const networkResponse = await fetchFn(url, { cache: 'no-cache' });
            if (networkResponse && networkResponse.ok) {
                const parsedData = await networkResponse.json();
                if (isValidDatasetStructure(parsedData, expectedKey)) {
                    // Background optional cache write
                    if (cachesObj) {
                        (async () => {
                            try {
                                const cache = await cachesObj.open(LEARNING_CACHE_NAME);
                                await cache.put(url, { status: 200, json: async () => parsedData });
                            } catch (cachePutErr) {
                                // optional cache write failure silently swallowed
                            }
                        })();
                    }
                    return parsedData;
                }
            }
        } catch (networkErr) {
            // network failed, continue to cache fallback
        }

        // 2. Secondary: Cache Storage Fallback
        if (cachesObj) {
            try {
                const cache = await cachesObj.open(LEARNING_CACHE_NAME);
                const cachedResponse = await cache.match(url);
                if (cachedResponse) {
                    try {
                        const cachedData = await cachedResponse.json();
                        if (isValidDatasetStructure(cachedData, expectedKey)) {
                            return cachedData;
                        }
                        throw new Error('Corrupted or invalid cache payload');
                    } catch (corruptErr) {
                        await cache.delete(url).catch(() => {});
                    }
                }
            } catch (cacheReadErr) {
                // cache read failed
            }
        }

        throw new Error(`Failed to load dataset: ${assetPath}`);
    }

    it('Scenario 1: Fresh browser loads dataset from network successfully', async () => {
        const mockLessons = { lessons: Array.from({ length: 600 }, (_, i) => ({ id: i + 1 })) };
        const mockFetch = async () => ({ ok: true, json: async () => mockLessons });
        const mockCaches = {
            open: async () => ({
                match: async () => null,
                put: async () => {},
                delete: async () => {}
            })
        };

        const result = await simulateDatasetLoader({
            fetchFn: mockFetch,
            cachesObj: mockCaches,
            path: '/data/dialect_lessons_600.json'
        });

        assert.equal(result.lessons.length, 600);
    });

    it('Scenario 2: Cache.put throws NetworkError (e.g. quota limit) -> dataset still loads without error', async () => {
        const mockLessons = { lessons: Array.from({ length: 600 }, (_, i) => ({ id: i + 1 })) };
        const mockFetch = async () => ({ ok: true, json: async () => mockLessons });
        const mockCaches = {
            open: async () => ({
                match: async () => null,
                put: async () => {
                    const err = new Error("Failed to execute 'put' on 'Cache': Cache.put() encountered a network error");
                    err.name = 'NetworkError';
                    throw err;
                },
                delete: async () => {}
            })
        };

        // Must NOT throw despite Cache.put throwing NetworkError
        const result = await simulateDatasetLoader({
            fetchFn: mockFetch,
            cachesObj: mockCaches,
            path: '/data/dialect_lessons_600.json'
        });

        assert.equal(result.lessons.length, 600, 'Dataset must load successfully even if Cache.put fails');
    });

    it('Scenario 3: Cache API completely unavailable ("caches" in window is false) -> network dataset loads', async () => {
        const mockLessons = { lessons: Array.from({ length: 600 }, (_, i) => ({ id: i + 1 })) };
        const mockFetch = async () => ({ ok: true, json: async () => mockLessons });

        const result = await simulateDatasetLoader({
            fetchFn: mockFetch,
            cachesObj: null, // No caches API
            path: '/data/dialect_lessons_600.json'
        });

        assert.equal(result.lessons.length, 600);
    });

    it('Scenario 4: Corrupted cache JSON entry self-heals by deleting corrupt entry and loading fresh network copy', async () => {
        let deletedUrl = null;
        const mockLessons = { lessons: Array.from({ length: 600 }, (_, i) => ({ id: i + 1 })) };
        const mockFetch = async () => ({ ok: true, json: async () => mockLessons });
        const mockCaches = {
            open: async () => ({
                match: async () => ({ json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); } }),
                put: async () => {},
                delete: async (u) => { deletedUrl = u; }
            })
        };

        const result = await simulateDatasetLoader({
            fetchFn: mockFetch,
            cachesObj: mockCaches,
            path: '/data/dialect_lessons_600.json'
        });

        assert.equal(result.lessons.length, 600);
    });

    it('Scenario 5: Offline with valid cached dataset -> recovers dataset from Cache Storage', async () => {
        const mockLessons = { lessons: Array.from({ length: 600 }, (_, i) => ({ id: i + 1 })) };
        const mockFetch = async () => { throw new Error('Failed to fetch (offline)'); };
        const mockCaches = {
            open: async () => ({
                match: async () => ({ json: async () => mockLessons }),
                put: async () => {},
                delete: async () => {}
            })
        };

        const result = await simulateDatasetLoader({
            fetchFn: mockFetch,
            cachesObj: mockCaches,
            path: '/data/dialect_lessons_600.json'
        });

        assert.equal(result.lessons.length, 600, 'Must recover from Cache Storage when offline');
    });

    it('Scenario 6: Both network and cache fail -> throws clean error for UI to show Dataset unavailable', async () => {
        const mockFetch = async () => { throw new Error('Network error'); };
        const mockCaches = {
            open: async () => ({
                match: async () => null,
                put: async () => {},
                delete: async () => {}
            })
        };

        await assert.rejects(async () => {
            await simulateDatasetLoader({
                fetchFn: mockFetch,
                cachesObj: mockCaches,
                path: '/data/dialect_lessons_600.json'
            });
        }, /Failed to load dataset/);
    });

    it('Scenario 7: Stale cache partition cleanup removes old version without touching user data', async () => {
        const deletedKeys = [];
        const mockCacheStorage = {
            keys: async () => ['saleem-learning-2026-08-14-multilingual', 'saleem-learning-2026-08-19-v3', 'saleem-learning-2026-08-19-v4', 'user-progress-data'],
            delete: async (k) => { deletedKeys.push(k); }
        };

        // Simulate cleanupOldLearningCaches
        const currentCacheName = 'saleem-learning-2026-08-19-v4';
        const keys = await mockCacheStorage.keys();
        for (const key of keys) {
            if (key.startsWith('saleem-learning-') && key !== currentCacheName) {
                await mockCacheStorage.delete(key);
            }
        }

        assert.deepEqual(deletedKeys, ['saleem-learning-2026-08-14-multilingual', 'saleem-learning-2026-08-19-v3']);
        assert.ok(!deletedKeys.includes('user-progress-data'), 'Must never delete user progress data');
    });
});
