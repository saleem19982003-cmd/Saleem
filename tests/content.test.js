const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));

test('Learning datasets contain the existing complete records', () => {
    const dialect = readJson('dialect_lessons_600.json').lessons;
    const culture = readJson('culture_lessons_100.json').lessons;

    assert.equal(dialect.length, 600);
    assert.equal(culture.length, 100);
    assert.equal(new Set(dialect.map(lesson => lesson.id)).size, dialect.length);
    assert.equal(new Set(culture.map(lesson => lesson.id)).size, culture.length);
    assert.ok(dialect.every(lesson => lesson.words?.length === 10 && lesson.questions?.length === 20));
    assert.ok(culture.every(lesson => lesson.story_en && lesson.practice_test?.length > 0));
});
