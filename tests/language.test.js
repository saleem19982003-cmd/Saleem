const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const aiSource = fs.readFileSync(path.join(root, 'server', 'routes', 'ai.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'server', 'routes', 'auth.js'), 'utf8');
const dialect = JSON.parse(fs.readFileSync(path.join(root, 'data', 'dialect_lessons_600.json'), 'utf8'));
const culture = JSON.parse(fs.readFileSync(path.join(root, 'data', 'culture_lessons_100.json'), 'utf8'));

const supportedLanguages = ['en', 'ar', 'am', 'so', 'fr', 'ti', 'sw', 'ha', 'om'];

test('supported language catalog is explicit and persistent', () => {
    for (const language of supportedLanguages) {
        assert.match(appSource, new RegExp(`\\b${language}: \\{ label:`));
    }
    assert.match(appSource, /localStorage\.setItem\('saleem_ui_lang'/);
    assert.match(appSource, /localStorage\.setItem\('saleem_user_language'/);
    assert.match(appSource, /preferred_language: normalized/);
    assert.match(authSource, /SUPPORTED_LANGUAGE_CODES/);
});

test('frontend and AI do not use English as a hidden language fallback', () => {
    assert.doesNotMatch(appSource, /const selectedDict = i18n\[lang\] \|\| i18n\.en/);
    assert.match(appSource, /return dict\[key\] \|\| translations\.ar\[key\]/);
    assert.match(aiSource, /Language contract: respond only in the preferred language and Egyptian Arabic/);
    assert.match(aiSource, /preferred language above together with Egyptian Arabic/);
    assert.match(aiSource, /effectiveSource/);
    assert.match(aiSource, /effectiveTarget/);
});

test('lesson datasets expose only Egyptian Arabic and English translation fields', () => {
    const firstWord = dialect.lessons[0].words[0];
    const firstQuestion = dialect.lessons[0].questions[0];
    const firstCulture = culture.lessons[0];

    assert.equal(dialect.lessons.length, 600);
    assert.equal(culture.lessons.length, 100);
    assert.ok(firstWord.meaning && firstWord.english && firstWord.example && firstWord.example_english);
    assert.ok(firstQuestion.question && firstQuestion.question_en);
    assert.ok(firstCulture.story_ar && firstCulture.story_en);

    const nonEnglishWordFields = ['fr', 'sw', 'am', 'so', 'ti', 'ha', 'om'];
    for (const field of nonEnglishWordFields) {
        assert.equal(Object.hasOwn(firstWord, field), false, `unexpected ${field} word field`);
    }
});

test('language direction keeps Egyptian Arabic RTL and other supported languages LTR', () => {
    assert.match(appSource, /document\.documentElement\.setAttribute\('dir', direction\)/);
    assert.match(appSource, /ar: \{ label: 'Egyptian Arabic', dir: 'rtl' \}/);
    for (const language of ['en', 'am', 'so', 'fr', 'ti', 'sw', 'ha', 'om']) {
        assert.match(appSource, new RegExp(`${language}: \\{ label: '[^']+', dir: 'ltr' \\}`));
    }
});
