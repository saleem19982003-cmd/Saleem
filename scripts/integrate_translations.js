#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const importDir = path.join(root, 'translation-import');
const languages = ['fr', 'am', 'so', 'ti', 'sw', 'ha', 'om'];
const invalidText = /^\s*$|undefined|null|todo|placeholder|api error|rate limit|http\s*\d+|<html/i;
const phraseOverrides = {
    so: { category: { admin: 'Maamulka' }, translation: { 'Kasr Al-Ainy Emergency Hospital': 'Isbitaalka Gurmadka Kasr Al-Ainy' } },
    ha: { category: { admin: 'Gudanarwa' }, translation: {} }
};

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const stable = value => JSON.stringify(value);

function extractPhrases() {
    const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const match = source.match(/const phrasesLibraryData = (\[.*?\]);\r?\n\r?\n\s+const phrasesGrid/s);
    if (!match) throw new Error('Could not read the existing phrase library from app.js');
    const phrases = vm.runInNewContext(`(${match[1]})`);
    if (!Array.isArray(phrases) || phrases.length !== 45) throw new Error(`Expected 45 source phrases, found ${phrases.length}`);
    return phrases;
}

function assertEqual(actual, expected, label) {
    if (stable(actual) !== stable(expected)) throw new Error(`Source mismatch: ${label}`);
}

function validateBundle(bundle, sourceDialect, sourceCulture, sourcePhrases, lang) {
    if (bundle.format !== 'saleem-static-translation-bundle-v1') throw new Error(`${lang}: unsupported bundle format`);
    if (!Array.isArray(bundle.target_languages) || !bundle.target_languages.some(item => item.code === lang)) throw new Error(`${lang}: target language missing from manifest`);
    if (bundle.dialect?.lessons?.length !== 600) throw new Error(`${lang}: expected 600 dialect lessons`);
    if (bundle.culture?.lessons?.length !== 100) throw new Error(`${lang}: expected 100 culture lessons`);
    if (bundle.phrases?.total !== 45 || bundle.phrases?.entries?.length !== 45) throw new Error(`${lang}: expected 45 phrases`);

    let vocabulary = 0;
    let dialectQuestions = 0;
    let culturePractice = 0;
    let invalid = 0;
    let exactEnglish = 0;
    const checkText = (value, source, label) => {
        if (typeof value !== 'string' || invalidText.test(value)) throw new Error(`${lang}: invalid ${label}`);
        if (value === source) exactEnglish += 1;
    };
    const checkOptions = (value, source, label) => {
        if (!Array.isArray(value) || value.length !== source.length) throw new Error(`${lang}: invalid ${label} array`);
        value.forEach((item, index) => checkText(item, source[index], `${label}[${index}]`));
    };

    bundle.dialect.lessons.forEach((lesson, lessonIndex) => {
        const sourceLesson = sourceDialect.lessons[lessonIndex];
        assertEqual(lesson.id, sourceLesson.id, `${lang} dialect lesson ${lessonIndex + 1} id`);
        assertEqual(lesson.words.length, sourceLesson.words.length, `${lang} dialect lesson ${lesson.id} word count`);
        assertEqual(lesson.questions.length, sourceLesson.questions.length, `${lang} dialect lesson ${lesson.id} question count`);
        lesson.words.forEach((word, index) => {
            const source = sourceLesson.words[index];
            assertEqual(word.index, index, `${lang} word index ${lesson.id}/${index}`);
            ['word', 'pronunciation', 'meaning', 'english', 'example', 'example_english', 'category', 'level'].forEach(key => assertEqual(word[key], source[key], `${lang} word source ${lesson.id}/${index}/${key}`));
            checkText(word[`meaning_${lang}`], source.english, `meaning_${lang}`);
            checkText(word[`example_${lang}`], source.example_english, `example_${lang}`);
            vocabulary += 1;
        });
        lesson.questions.forEach((question, index) => {
            const source = sourceLesson.questions[index];
            assertEqual(question.index, index, `${lang} question index ${lesson.id}/${index}`);
            ['question', 'question_en', 'options', 'answer', 'explanation'].forEach(key => assertEqual(question[key], source[key], `${lang} question source ${lesson.id}/${index}/${key}`));
            if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) throw new Error(`${lang}: invalid answer index ${lesson.id}/${index}`);
            checkText(question[`question_${lang}`], source.question_en, `question_${lang}`);
            checkOptions(question[`options_${lang}`], source.options, `options_${lang}`);
            checkText(question[`explanation_${lang}`], source.explanation, `explanation_${lang}`);
            dialectQuestions += 1;
        });
    });

    bundle.culture.lessons.forEach((lesson, lessonIndex) => {
        const sourceLesson = sourceCulture.lessons[lessonIndex];
        assertEqual(lesson.id, sourceLesson.id, `${lang} culture lesson ${lessonIndex + 1} id`);
        ['title_ar', 'title_en', 'category', 'category_ar', 'category_en', 'story_ar', 'story_en'].forEach(key => assertEqual(lesson[key], sourceLesson[key], `${lang} culture source ${lesson.id}/${key}`));
        checkText(lesson[`title_${lang}`], sourceLesson.title_en, `culture title_${lang}`);
        checkText(lesson[`category_${lang}`], sourceLesson.category_en, `culture category_${lang}`);
        checkText(lesson[`story_${lang}`], sourceLesson.story_en, `culture story_${lang}`);
        assertEqual(lesson.practice_test.length, sourceLesson.practice_test.length, `${lang} culture practice count ${lesson.id}`);
        lesson.practice_test.forEach((question, index) => {
            const source = sourceLesson.practice_test[index];
            assertEqual(question.index, index, `${lang} culture practice index ${lesson.id}/${index}`);
            ['question', 'options', 'answer', 'explanation'].forEach(key => assertEqual(question[key], source[key], `${lang} culture practice source ${lesson.id}/${index}/${key}`));
            if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) throw new Error(`${lang}: invalid culture answer index ${lesson.id}/${index}`);
            checkText(question[`question_${lang}`], source.question, `culture question_${lang}`);
            checkOptions(question[`options_${lang}`], source.options, `culture options_${lang}`);
            checkText(question[`explanation_${lang}`], source.explanation, `culture explanation_${lang}`);
            culturePractice += 1;
        });
    });

    bundle.phrases.entries.forEach((phrase, index) => {
        const source = sourcePhrases[index];
        assertEqual(phrase.index, index, `${lang} phrase index ${index}`);
        ['eg', 'en', 'cat', 'lvl'].forEach(key => assertEqual(phrase[key], source[key], `${lang} phrase source ${index}/${key}`));
        checkText(phrase[`translation_${lang}`], source.en, `phrase translation_${lang}`);
        checkText(phrase[`category_${lang}`], source.cat, `phrase category_${lang}`);
        checkText(phrase[`level_${lang}`], source.lvl, `phrase level_${lang}`);
    });

    if (invalid) throw new Error(`${lang}: ${invalid} invalid values`);
    return { language: lang, vocabulary, dialectQuestions, cultureLessons: 100, culturePractice, phrases: 45, exactSourceMatches: exactEnglish };
}

function mergeLanguage(target, bundle, lang) {
    bundle.dialect.lessons.forEach((lesson, lessonIndex) => {
        lesson.words.forEach((word, wordIndex) => {
            target.dialect.lessons[lessonIndex].words[wordIndex][`meaning_${lang}`] = word[`meaning_${lang}`];
            target.dialect.lessons[lessonIndex].words[wordIndex][`example_${lang}`] = word[`example_${lang}`];
        });
        lesson.questions.forEach((question, questionIndex) => {
            const targetQuestion = target.dialect.lessons[lessonIndex].questions[questionIndex];
            targetQuestion[`question_${lang}`] = question[`question_${lang}`];
            targetQuestion[`options_${lang}`] = question[`options_${lang}`];
            targetQuestion[`explanation_${lang}`] = question[`explanation_${lang}`];
        });
    });
    bundle.culture.lessons.forEach((lesson, lessonIndex) => {
        const targetLesson = target.culture.lessons[lessonIndex];
        targetLesson[`title_${lang}`] = lesson[`title_${lang}`];
        targetLesson[`category_${lang}`] = lesson[`category_${lang}`];
        targetLesson[`story_${lang}`] = lesson[`story_${lang}`];
        lesson.practice_test.forEach((question, questionIndex) => {
            const targetQuestion = targetLesson.practice_test[questionIndex];
            targetQuestion[`question_${lang}`] = question[`question_${lang}`];
            targetQuestion[`options_${lang}`] = question[`options_${lang}`];
            targetQuestion[`explanation_${lang}`] = question[`explanation_${lang}`];
        });
    });
}

const targetDialect = readJson(path.join(dataDir, 'dialect_lessons_600.json'));
const targetCulture = readJson(path.join(dataDir, 'culture_lessons_100.json'));
const sourcePhrases = extractPhrases();
const targetPhrases = sourcePhrases.map((phrase, index) => ({ index, ...phrase }));
const reports = [];

for (const lang of languages) {
    const file = path.join(importDir, `saleem_static_translation_${lang}.json`);
    if (!fs.existsSync(file)) throw new Error(`Missing translation file: ${file}`);
    const bundle = readJson(file);
    reports.push(validateBundle(bundle, targetDialect, targetCulture, sourcePhrases, lang));
    mergeLanguage({ dialect: targetDialect, culture: targetCulture }, bundle, lang);
    bundle.phrases.entries.forEach((phrase, index) => {
        targetPhrases[index][`translation_${lang}`] = phrase[`translation_${lang}`];
        targetPhrases[index][`category_${lang}`] = phrase[`category_${lang}`];
        targetPhrases[index][`level_${lang}`] = phrase[`level_${lang}`];
        const overrides = phraseOverrides[lang] || {};
        if (overrides.category?.[phrase.cat]) targetPhrases[index][`category_${lang}`] = overrides.category[phrase.cat];
        if (overrides.translation?.[phrase.en]) targetPhrases[index][`translation_${lang}`] = overrides.translation[phrase.en];
    });
}

writeJson(path.join(dataDir, 'dialect_lessons_600.json'), targetDialect);
writeJson(path.join(dataDir, 'culture_lessons_100.json'), targetCulture);
writeJson(path.join(dataDir, 'phrases_45.json'), { total: targetPhrases.length, phrases: targetPhrases });
writeJson(path.join(dataDir, 'translation_coverage_report.json'), { generated_at: new Date().toISOString(), reports });

console.log(JSON.stringify(reports, null, 2));
console.log('Validated and integrated all seven translation bundles.');
