const test = require('node:test');
const assert = require('node:assert/strict');
const { auditTranslationQuality, DIALECT_SAMPLE_IDS, CULTURE_SAMPLE_IDS, LANGUAGES } = require('../scripts/audit_translation_quality');

test('translation quality audit covers required samples and languages', () => {
    const report = auditTranslationQuality();
    assert.deepEqual(report.sample_ids.dialect, DIALECT_SAMPLE_IDS);
    assert.deepEqual(report.sample_ids.culture, CULTURE_SAMPLE_IDS);
    assert.deepEqual(Object.keys(report.languages), LANGUAGES);
    for (const language of LANGUAGES) {
        assert.ok(report.languages[language].records > 85000);
        assert.equal(report.languages[language].failed, 0, `${language} has failed translation fields`);
    }
});
