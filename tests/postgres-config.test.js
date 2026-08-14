const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('DATABASE_URL takes precedence over Marketplace PostgreSQL variables', () => {
    const env = { ...process.env };
    env.DATABASE_URL = 'postgresql://database.example:6543/saleem';
    env.POSTGRES_URL = 'postgresql://marketplace.example:6543/saleem';
    env.POSTGRES_PRISMA_URL = 'postgresql://prisma.example:6543/saleem';
    env.POSTGRES_URL_NON_POOLING = 'postgresql://direct.example:5432/saleem';

    const result = spawnSync(process.execPath, [
        '-e',
        "process.stdout.write(require('./server/postgres').POSTGRES_SOURCE)",
    ], {
        cwd: path.join(__dirname, '..'),
        env,
        encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'DATABASE_URL');
});
