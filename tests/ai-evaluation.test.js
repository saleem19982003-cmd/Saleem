const test = require('node:test');
const assert = require('node:assert/strict');
const { retrieveKnowledge } = require('../server/ai-knowledge');

const languages = ['en', 'fr', 'am', 'so', 'ti', 'sw', 'ha', 'om'];
const lessonIds = Array.from({ length: 50 }, (_, index) => 1 + Math.round(index * 599 / 49));

test('deterministic AI retrieval evaluation covers 400 representative prompts', () => {
    let passed = 0;
    for (const language of languages) {
        for (const id of lessonIds) {
            const result = retrieveKnowledge(`lesson ${id}`, language);
            const record = result.records[0];
            assert.equal(result.intent, 'lesson');
            assert.equal(record.id, id);
            assert.ok(record.words.length > 0);
            assert.ok(record.words.every(word => word.egyptian && word.meaning && word.example));
            passed += 1;
        }
    }
    assert.equal(passed, 400);
});
