const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routesRoot = path.join(__dirname, '..', 'server', 'routes');

test('server SQL uses portable single-quoted SQLite string literals', () => {
    const source = fs.readdirSync(routesRoot)
        .filter((file) => file.endsWith('.js'))
        .map((file) => fs.readFileSync(path.join(routesRoot, file), 'utf8'))
        .join('\n');

    assert.doesNotMatch(source, /datetime\("now"\)/);
    for (const literal of [
        'user',
        'assistant',
        'ai_message_sent',
        'event_viewed',
        'event_registered',
        'lesson_started',
        'lesson_completed',
        'resource_viewed',
        'resource_saved',
    ]) {
        assert.doesNotMatch(source, new RegExp(`VALUES[^\\n]*"${literal}"`));
    }
});
