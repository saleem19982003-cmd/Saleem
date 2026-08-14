const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dialect = JSON.parse(fs.readFileSync(path.join(root, 'data', 'dialect_lessons_600.json'), 'utf8'));
const culture = JSON.parse(fs.readFileSync(path.join(root, 'data', 'culture_lessons_100.json'), 'utf8'));
const phrases = JSON.parse(fs.readFileSync(path.join(root, 'data', 'phrases_45.json'), 'utf8')).phrases;
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const languages = ['fr', 'am', 'so', 'ti', 'sw', 'ha', 'om'];
const badValue = /undefined|null|todo|placeholder|api error|rate limit|http\s*\d+|<html/i;
const representativeDialectIds = [1, 50, 100, 200, 300, 400, 500, 600];
const representativeCultureIds = [1, 20, 40, 60, 80, 100];

function assertText(value, label) {
    assert.equal(typeof value, 'string', `${label} must be text`);
    assert.ok(value.trim().length > 0, `${label} must not be empty`);
    assert.doesNotMatch(value, badValue, `${label} contains a bad placeholder or API response`);
}

test('multilingual dataset counts and source identity are complete', () => {
    assert.equal(dialect.lessons.length, 600);
    assert.equal(dialect.lessons.reduce((total, lesson) => total + lesson.words.length, 0), 6000);
    assert.equal(dialect.lessons.reduce((total, lesson) => total + lesson.questions.length, 0), 12000);
    assert.equal(culture.lessons.length, 100);
    assert.equal(culture.lessons.reduce((total, lesson) => total + lesson.practice_test.length, 0), 200);
    assert.equal(phrases.length, 45);
    assert.equal(new Set(dialect.lessons.map(lesson => lesson.id)).size, 600);
    assert.equal(new Set(culture.lessons.map(lesson => lesson.id)).size, 100);
});

test('all seven languages have complete fields across every record', () => {
    let vocabulary = 0;
    let dialectQuestions = 0;
    let culturePractice = 0;
    let exactEnglishLeakage = 0;

    const checkTranslated = (value, source, label) => {
        assertText(value, label);
        if (value === source && !/[\u0600-\u06ff]/u.test(source)) exactEnglishLeakage += 1;
    };

    for (const language of languages) {
        for (const lesson of dialect.lessons) {
            for (const word of lesson.words) {
                checkTranslated(word[`meaning_${language}`], word.english, `dialect ${lesson.id} meaning_${language}`);
                checkTranslated(word[`example_${language}`], word.example_english, `dialect ${lesson.id} example_${language}`);
                vocabulary += 1;
            }
            for (const question of lesson.questions) {
                checkTranslated(question[`question_${language}`], question.question_en, `dialect question_${language}`);
                assert.equal(question[`options_${language}`].length, question.options.length);
                question[`options_${language}`].forEach((option, index) => checkTranslated(option, question.options[index], `dialect option ${language}`));
                checkTranslated(question[`explanation_${language}`], question.explanation, `dialect explanation_${language}`);
                assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length);
                dialectQuestions += 1;
            }
        }
        for (const lesson of culture.lessons) {
            checkTranslated(lesson[`title_${language}`], lesson.title_en, `culture title_${language}`);
            checkTranslated(lesson[`category_${language}`], lesson.category_en, `culture category_${language}`);
            checkTranslated(lesson[`story_${language}`], lesson.story_en, `culture story_${language}`);
            for (const question of lesson.practice_test) {
                checkTranslated(question[`question_${language}`], question.question, `culture question_${language}`);
                assert.equal(question[`options_${language}`].length, question.options.length);
                question[`options_${language}`].forEach((option, index) => checkTranslated(option, question.options[index], `culture option ${language}`));
                checkTranslated(question[`explanation_${language}`], question.explanation, `culture explanation_${language}`);
                assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length);
                culturePractice += 1;
            }
        }
        for (const phrase of phrases) {
            checkTranslated(phrase[`translation_${language}`], phrase.en, `phrase translation_${language}`);
            checkTranslated(phrase[`category_${language}`], phrase.cat, `phrase category_${language}`);
            checkTranslated(phrase[`level_${language}`], phrase.lvl, `phrase level_${language}`);
        }
    }

    assert.equal(vocabulary, 42000);
    assert.equal(dialectQuestions, 84000);
    assert.equal(culturePractice, 1400);
    console.log(`Measured exact source-language leakage: ${exactEnglishLeakage}`);
});

test('representative records retain ids, indexes, and progress-compatible lesson keys', () => {
    for (const id of representativeDialectIds) {
        const lesson = dialect.lessons.find(item => item.id === id);
        assert.ok(lesson, `missing dialect lesson ${id}`);
        assert.equal(lesson.words.length, 10);
        assert.equal(lesson.questions.length, 20);
    }
    for (const id of representativeCultureIds) {
        const lesson = culture.lessons.find(item => item.id === id);
        assert.ok(lesson, `missing culture lesson ${id}`);
        assert.equal(lesson.practice_test.length, 2);
    }
    assert.match(appSource, /saleem_completed_dialect_lessons/);
    assert.match(appSource, /saleem_completed_culture_lessons/);
    assert.match(appSource, /saleem_learning_last_lesson/);
    assert.doesNotMatch(appSource, /removeItem\(['"]saleem_completed_(?:dialect|culture)_lessons/);
});
