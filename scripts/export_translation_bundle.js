#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const targetLanguages = [
    { code: 'fr', name: 'French' },
    { code: 'am', name: 'Amharic' },
    { code: 'so', name: 'Somali' },
    { code: 'ti', name: 'Tigrinya' },
    { code: 'sw', name: 'Swahili' },
    { code: 'ha', name: 'Hausa' },
    { code: 'om', name: 'Oromo' }
];

const readJson = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));

function extractPhrases() {
    const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const match = source.match(/const phrasesLibraryData = (\[.*?\]);\r?\n\r?\n\s+const phrasesGrid/s);
    if (!match) throw new Error('The existing 45-entry phrase library was not found.');
    const phrases = vm.runInNewContext(`(${match[1]})`);
    if (!Array.isArray(phrases) || phrases.length !== 45) throw new Error(`Expected 45 phrases, found ${phrases.length}`);
    return phrases.map((phrase, index) => ({ index, ...phrase }));
}

const dialect = readJson('dialect_lessons_600.json');
const culture = readJson('culture_lessons_100.json');
const bundle = {
    format: 'saleem-static-translation-bundle-v1',
    source_languages: ['Egyptian Arabic', 'English'],
    target_languages: targetLanguages,
    restrictions: [
        'Translate static educational content only.',
        'Preserve every lesson id, word order, question order, and answer index.',
        'Preserve Egyptian Arabic source fields and existing English source fields.',
        'Do not add user, profile, authentication, community, review, analytics, or location data.'
    ],
    required_fields: {
        dialect_word: ['meaning_<language>', 'example_<language>'],
        dialect_quiz: ['question_<language>', 'options_<language>', 'explanation_<language>'],
        culture_lesson: ['title_<language>', 'category_<language>', 'story_<language>'],
        culture_practice: ['question_<language>', 'options_<language>', 'explanation_<language>'],
        phrase: ['translation_<language>', 'category_<language>', 'level_<language>']
    },
    dialect: {
        total_lessons: dialect.lessons.length,
        lessons: dialect.lessons.map(lesson => ({
            id: lesson.id,
            title_ar: lesson.title_ar,
            title_en: lesson.title_en,
            words: lesson.words.map((word, index) => ({ index, ...word })),
            questions: lesson.questions.map((question, index) => ({ index, ...question }))
        }))
    },
    culture: {
        total_lessons: culture.lessons.length,
        lessons: culture.lessons.map(lesson => ({
            id: lesson.id,
            title_ar: lesson.title_ar,
            title_en: lesson.title_en,
            category: lesson.category,
            category_ar: lesson.category_ar,
            category_en: lesson.category_en,
            story_ar: lesson.story_ar,
            story_en: lesson.story_en,
            practice_test: (lesson.practice_test || []).map((question, index) => ({ index, ...question }))
        }))
    },
    phrases: {
        total: 45,
        entries: extractPhrases()
    }
};

const output = path.join(dataDir, 'saleem_static_translation_bundle.json');
fs.writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
console.log(`Wrote ${output}`);
console.log(`Dialect: ${bundle.dialect.total_lessons} lessons, ${bundle.dialect.lessons.reduce((n, lesson) => n + lesson.words.length, 0)} words, ${bundle.dialect.lessons.reduce((n, lesson) => n + lesson.questions.length, 0)} questions`);
console.log(`Culture: ${bundle.culture.total_lessons} lessons, ${bundle.culture.lessons.reduce((n, lesson) => n + lesson.practice_test.length, 0)} practice questions`);
console.log(`Phrases: ${bundle.phrases.total}`);
