// Server-side retrieval for Saleem's public educational content.
// This module never reads users, profiles, conversations, GPS, or community data.
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUPPORTED_LANGUAGES = new Set(['en', 'ar', 'am', 'so', 'fr', 'ti', 'sw', 'ha', 'om']);
const cache = { dialect: null, culture: null, phrases: null, dialectIndex: null, cultureIndex: null, phraseIndex: null };

function readJson(name) {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
}

function getDialect() {
    if (!cache.dialect) cache.dialect = readJson('dialect_lessons_600.json').lessons || [];
    return cache.dialect;
}

function getCulture() {
    if (!cache.culture) cache.culture = readJson('culture_lessons_100.json').lessons || [];
    return cache.culture;
}

function getPhrases() {
    if (!cache.phrases) cache.phrases = readJson('phrases_45.json').phrases || [];
    return cache.phrases;
}

function getIndex(kind, records, searchBuilder) {
    const key = `${kind}Index`;
    if (!cache[key]) cache[key] = records.map(item => ({ item, haystack: normalize(searchBuilder(item).filter(Boolean).join(' ')) }));
    return cache[key];
}

function normalize(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\u064B-\u065F\u0670]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value) {
    return normalize(value).split(/\s+/).filter(token => token.length > 1).slice(0, 24);
}

function languageKey(language) {
    return SUPPORTED_LANGUAGES.has(language) ? language : 'en';
}

function scoreHaystack(queryTokens, haystack) {
    if (!queryTokens.length) return 1;
    return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? (token.length > 4 ? 3 : 1) : 0), 0);
}

function detectIntent(query, explicitIntent = '') {
    const normalized = normalize(query);
    if (/ignore previous|ignore all|system prompt|developer message|jailbreak|reveal secret|show key|database password|jwt secret|api key/.test(normalized)) return 'safety';
    if (/\b(quiz|test|practice|question|اختبار|تمرين|سؤال|تمارين)\b/.test(normalized)) return 'quiz';
    if (/\b(culture|cultural|ثقافة|ثقافي|tradition|custom|رمضان|عيد)\b/.test(normalized)) return 'culture';
    if (/\b(phrase|phrases|phrasebook|عبارة|عبارات|جملة|جمل)\b/.test(normalized)) return 'phrase';
    if (/\b(service|services|help|unhcr|stars|caritas|legal|doctor|hospital|resource|مساعدة|خدمات|مفوضية|محامي|مستشفى)\b/.test(normalized)) return 'service';
    if (/\b(lesson|lecon|leçon|درس|دروس|cashar|somo|darasi|barnoota|ትምህርት|መስመር)\b/.test(normalized)) return 'lesson';
    return explicitIntent || 'dialect';
}

function requestedLessonId(query) {
    const match = String(query || '').match(/\b(?:lesson|lecon|leçon|درس|cashar|somo|darasi|barnoota)\s*#?\s*(\d{1,3})\b/i);
    const id = match ? Number(match[1]) : 0;
    return id >= 1 && id <= 600 ? id : null;
}

function searchableDialect(lesson) {
    return [lesson.title_ar, lesson.title_en, ...(lesson.words || []).flatMap(word => Object.values(word)), ...(lesson.questions || []).flatMap(question => Object.values(question))];
}

function flattenSearchValue(value) {
    if (Array.isArray(value)) return value.flatMap(flattenSearchValue);
    if (value && typeof value === 'object') return Object.values(value).flatMap(flattenSearchValue);
    return [value];
}

function searchableCulture(lesson) {
    return flattenSearchValue(lesson);
}

function searchablePhrase(phrase) {
    return Object.values(phrase);
}

function pickDialect(lesson, language, includeQuiz = false) {
    const lang = languageKey(language);
    const words = (lesson.words || []).slice(0, 5).map(word => ({
        egyptian: word.word,
        pronunciation: word.pronunciation,
        meaning: lang === 'en' ? word.english : (word[`meaning_${lang}`] || word.meaning),
        exampleEgyptian: word.example,
        example: lang === 'en' ? word.example_english : (word[`example_${lang}`] || word.example)
    }));
    const result = { type: 'dialect_lesson', id: lesson.id, title: lang === 'ar' ? lesson.title_ar : (lang === 'en' ? lesson.title_en : String(lesson.id)), words };
    if (includeQuiz && lesson.questions?.[0]) {
        const question = lesson.questions[0];
        result.quiz = {
            question: lang === 'en' ? question.question_en || question.question : question[`question_${lang}`] || question.question,
            options: lang === 'en' ? question.options_en || question.options : question[`options_${lang}`] || question.options,
            explanation: lang === 'en' ? question.explanation_en || question.explanation : question[`explanation_${lang}`] || question.explanation,
            correctIndex: question.answer
        };
    }
    return result;
}

function pickCulture(lesson, language, includeQuiz = false) {
    const lang = languageKey(language);
    const result = {
        type: 'culture_lesson',
        id: lesson.id,
        title: lang === 'ar' ? lesson.title_ar : (lang === 'en' ? lesson.title_en : (lesson[`title_${lang}`] || lesson.title_en)),
        category: lang === 'ar' ? lesson.category_ar : (lang === 'en' ? lesson.category_en : (lesson[`category_${lang}`] || lesson.category_en)),
        story: lang === 'ar' ? lesson.story_ar : (lang === 'en' ? lesson.story_en : (lesson[`story_${lang}`] || lesson.story_en))
    };
    if (includeQuiz && lesson.practice_test?.[0]) {
        const question = lesson.practice_test[0];
        result.practice = {
            question: lang === 'en' ? question.question_en || question.question : question[`question_${lang}`] || question.question,
            options: lang === 'en' ? question.options_en || question.options : question[`options_${lang}`] || question.options,
            explanation: lang === 'en' ? question.explanation_en || question.explanation : question[`explanation_${lang}`] || question.explanation,
            correctIndex: question.answer
        };
    }
    return result;
}

function pickPhrase(phrase, language) {
    const lang = languageKey(language);
    return { type: 'phrase', id: phrase.index, egyptian: phrase.eg, translation: lang === 'en' ? phrase.en : (phrase[`translation_${lang}`] || phrase.en), category: lang === 'en' ? phrase.cat : (phrase[`category_${lang}`] || phrase.cat) };
}

function retrieveKnowledge(query, language = 'en', options = {}) {
    const lang = languageKey(language);
    const intent = detectIntent(query, options.intent);
    if (intent === 'safety') return { intent, records: [], blocked: true };
    const queryTokens = tokens(query);
    const lessonId = requestedLessonId(query);
    const records = [];
    if (intent === 'culture') {
        getIndex('culture', getCulture(), searchableCulture).map(({ item, haystack }) => ({ item, score: lessonId === item.id ? 100 : scoreHaystack(queryTokens, haystack) }))
            .filter(item => item.score > 0 || lessonId === item.item.id).sort((a, b) => b.score - a.score || a.item.id - b.item.id).slice(0, 3)
            .forEach(({ item }) => records.push(pickCulture(item, lang, intent === 'quiz')));
    } else if (intent === 'phrase') {
        getIndex('phrase', getPhrases(), searchablePhrase).map(({ item, haystack }) => ({ item, score: scoreHaystack(queryTokens, haystack) }))
            .filter(item => item.score > 0 || !queryTokens.length).sort((a, b) => b.score - a.score || a.item.index - b.item.index).slice(0, 5)
            .forEach(({ item }) => records.push(pickPhrase(item, lang)));
    } else {
        getIndex('dialect', getDialect(), searchableDialect).map(({ item, haystack }) => ({ item, score: lessonId === item.id ? 100 : scoreHaystack(queryTokens, haystack) }))
            .filter(item => item.score > 0 || lessonId === item.id).sort((a, b) => b.score - a.score || a.item.id - b.item.id).slice(0, intent === 'lesson' || intent === 'quiz' ? 2 : 4)
            .forEach(({ item }) => records.push(pickDialect(item, lang, intent === 'quiz')));
    }
    return { intent, records, blocked: false };
}

function formatKnowledgeContext(result) {
    if (!result.records.length) return 'No matching public Saleem educational record was found. Do not invent a lesson, phrase, quiz answer, or cultural fact.';
    return JSON.stringify(result.records, null, 2);
}

function getDatasetStats() {
    return {
        dialectLessons: getDialect().length,
        dialectVocabulary: getDialect().reduce((count, lesson) => count + (lesson.words || []).length, 0),
        dialectQuizzes: getDialect().reduce((count, lesson) => count + (lesson.questions || []).length, 0),
        cultureLessons: getCulture().length,
        culturePracticeQuestions: getCulture().reduce((count, lesson) => count + (lesson.practice_test || []).length, 0),
        phrases: getPhrases().length
    };
}

module.exports = { SUPPORTED_LANGUAGES, normalize, detectIntent, retrieveKnowledge, formatKnowledgeContext, getDatasetStats };
