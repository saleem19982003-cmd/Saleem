#!/usr/bin/env node
/* Automated translation quality triage. This identifies records that need human
 * review; it deliberately does not claim native-speaker validation. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LANGUAGES = ['fr', 'am', 'so', 'ti', 'sw', 'ha', 'om'];
const DIALECT_SAMPLE_IDS = [1, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600];
const CULTURE_SAMPLE_IDS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const BAD_VALUE = /undefined|null|todo|placeholder|api\s*error|rate\s*limit|http\s*\d+|<\/?html|translation\s+(failed|error)/i;
const ENGLISH_MARKERS = /\b(the|and|you|your|what|this|that|with|for|from|help|please|great|good|lesson|question|answer|choose|correct|wrong|of)\b/gi;

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function asText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function hasArabic(value) {
    return /[\u0600-\u06ff]/u.test(value);
}

function deterministicSample(items, ids, idKey = 'id') {
    const required = ids.map(id => items.find(item => Number(item[idKey]) === id)).filter(Boolean);
    const remaining = items.filter(item => !ids.includes(Number(item[idKey])));
    let state = 0x51a7;
    const sample = [...required];
    while (sample.length < Math.min(items.length, required.length + 12) && remaining.length) {
        state = (state * 1664525 + 1013904223) >>> 0;
        sample.push(remaining.splice(state % remaining.length, 1)[0]);
    }
    return sample;
}

function checkText(value, source, { allowSourceLanguage = false } = {}) {
    const text = asText(value);
    if (!text || BAD_VALUE.test(text)) return { status: 'FAILED', reasons: ['missing-or-error-text'] };
    if (!allowSourceLanguage && source && !hasArabic(source) && text === asText(source)) {
        return { status: 'FAILED', reasons: ['exact-source-copy'] };
    }
    const englishWords = (text.match(ENGLISH_MARKERS) || []).length;
    if (!allowSourceLanguage && englishWords >= 3) {
        return { status: 'NEEDS_REVIEW', reasons: ['possible-english-leakage'] };
    }
    if (source && text.length > Math.max(240, source.length * 8)) {
        return { status: 'NEEDS_REVIEW', reasons: ['unusually-long-translation'] };
    }
    return { status: 'PASS', reasons: [] };
}

function addResult(summary, language, pathName, result, sample) {
    summary[language].records += 1;
    summary[language][result.status.toLowerCase()] += 1;
    for (const reason of result.reasons) summary[language].reasons[reason] = (summary[language].reasons[reason] || 0) + 1;
    if (sample && result.status !== 'PASS' && summary[language].samples.length < 40) {
        summary[language].samples.push({ path: pathName, status: result.status, reasons: result.reasons });
    }
}

function makeSummary() {
    return Object.fromEntries(LANGUAGES.map(language => [language, {
        records: 0, pass: 0, needs_review: 0, failed: 0, reasons: {}, samples: []
    }]));
}

function auditTranslationQuality() {
    const dialect = readJson('data/dialect_lessons_600.json').lessons;
    const culture = readJson('data/culture_lessons_100.json').lessons;
    const phrases = readJson('data/phrases_45.json').phrases;
    const summary = makeSummary();
    const samples = {
        dialect: deterministicSample(dialect, DIALECT_SAMPLE_IDS),
        culture: deterministicSample(culture, CULTURE_SAMPLE_IDS),
        phrases: phrases.slice(0, 12)
    };
    const highRisk = new Set(['slang', 'emergency', 'legal', 'health', 'healthcare', 'refugee', 'street']);
    const highRiskCounts = Object.fromEntries(LANGUAGES.map(language => [language, 0]));
    const duplicateCultureStories = {};

    for (const language of LANGUAGES) {
        for (const lesson of dialect) {
            const sampled = samples.dialect.includes(lesson);
            for (const word of lesson.words) {
                const risk = highRisk.has(String(word.category || '').toLowerCase());
                const result = checkText(word[`meaning_${language}`], word.english);
                addResult(summary, language, `dialect/${lesson.id}/word/${word.word}/meaning`, result, sampled || risk);
                if (risk && result.status !== 'PASS') highRiskCounts[language] += 1;
                const exampleResult = checkText(word[`example_${language}`], word.example_english);
                addResult(summary, language, `dialect/${lesson.id}/word/${word.word}/example`, exampleResult, sampled || risk);
                if (risk && exampleResult.status !== 'PASS') highRiskCounts[language] += 1;
            }
            for (let index = 0; index < lesson.questions.length; index += 1) {
                const question = lesson.questions[index];
                const risk = highRisk.has(String(lesson.category || '').toLowerCase());
                const questionResult = checkText(question[`question_${language}`], question.question_en);
                addResult(summary, language, `dialect/${lesson.id}/question/${index}/question`, questionResult, sampled || risk);
                if (risk && questionResult.status !== 'PASS') highRiskCounts[language] += 1;
                const explanationResult = checkText(question[`explanation_${language}`], question.explanation);
                addResult(summary, language, `dialect/${lesson.id}/question/${index}/explanation`, explanationResult, sampled || risk);
                if (risk && explanationResult.status !== 'PASS') highRiskCounts[language] += 1;
                const options = question[`options_${language}`];
                if (!Array.isArray(options) || options.length !== question.options.length) {
                    addResult(summary, language, `dialect/${lesson.id}/question/${index}/options`, { status: 'FAILED', reasons: ['option-count-mismatch'] }, sampled || risk);
                } else {
                    options.forEach((option, optionIndex) => {
                        const result = checkText(option, question.options[optionIndex], { allowSourceLanguage: true });
                        addResult(summary, language, `dialect/${lesson.id}/question/${index}/option/${optionIndex}`, result, sampled || risk);
                    });
                }
            }
        }
        for (const lesson of culture) {
            const sampled = samples.culture.includes(lesson);
            for (const field of ['title', 'category', 'story']) {
                const result = checkText(lesson[`${field}_${language}`], lesson[`${field}_en`]);
                addResult(summary, language, `culture/${lesson.id}/${field}`, result, sampled);
            }
            const story = asText(lesson[`story_${language}`]);
            if (story) {
                const key = `${language}:${story}`;
                if (!duplicateCultureStories[key]) duplicateCultureStories[key] = { count: 0, sourceStories: new Set() };
                duplicateCultureStories[key].count += 1;
                duplicateCultureStories[key].sourceStories.add(asText(lesson.story_en));
            }
            for (let index = 0; index < lesson.practice_test.length; index += 1) {
                const question = lesson.practice_test[index];
                const questionResult = checkText(question[`question_${language}`], question.question, { allowSourceLanguage: true });
                addResult(summary, language, `culture/${lesson.id}/practice/${index}/question`, questionResult, sampled);
                const explanationResult = checkText(question[`explanation_${language}`], question.explanation, { allowSourceLanguage: true });
                addResult(summary, language, `culture/${lesson.id}/practice/${index}/explanation`, explanationResult, sampled);
                const options = question[`options_${language}`];
                if (!Array.isArray(options) || options.length !== question.options.length) {
                    addResult(summary, language, `culture/${lesson.id}/practice/${index}/options`, { status: 'FAILED', reasons: ['option-count-mismatch'] }, sampled);
                } else {
                    options.forEach((option, optionIndex) => {
                        const result = checkText(option, question.options[optionIndex], { allowSourceLanguage: true });
                        addResult(summary, language, `culture/${lesson.id}/practice/${index}/option/${optionIndex}`, result, sampled);
                    });
                }
            }
        }
        for (const phrase of phrases) {
            for (const field of ['translation', 'category', 'level']) {
                const result = checkText(phrase[`${field}_${language}`], phrase[field === 'translation' ? 'en' : field === 'category' ? 'cat' : 'lvl']);
                addResult(summary, language, `phrase/${phrase.index}/${field}`, result, samples.phrases.includes(phrase));
            }
        }
    }

    const duplicatedCultureStoryGroups = Object.values(duplicateCultureStories).filter(item => item.count > 1);
    const unexpectedLocalizedCultureStoryGroups = duplicatedCultureStoryGroups.filter(item => item.sourceStories.size > 1).length;
    return {
        generated_at: new Date().toISOString(),
        methodology: 'Automated triage only; PASS means structural and heuristic checks passed, not native-speaker approval.',
        sample_ids: { dialect: DIALECT_SAMPLE_IDS, culture: CULTURE_SAMPLE_IDS, phrase_indexes: samples.phrases.map(item => item.index) },
        high_risk_non_pass_findings: highRiskCounts,
        duplicated_localized_culture_story_groups: duplicatedCultureStoryGroups.length,
        repeated_source_content_groups: duplicatedCultureStoryGroups.length - unexpectedLocalizedCultureStoryGroups,
        unexpected_localized_culture_story_groups: unexpectedLocalizedCultureStoryGroups,
        languages: summary
    };
}

if (require.main === module) {
    const report = auditTranslationQuality();
    const output = process.argv.includes('--json') ? JSON.stringify(report, null, 2) : JSON.stringify(report, null, 2);
    process.stdout.write(`${output}\n`);
}

module.exports = { auditTranslationQuality, LANGUAGES, DIALECT_SAMPLE_IDS, CULTURE_SAMPLE_IDS };
