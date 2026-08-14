const fs = require('node:fs');
const dialect = JSON.parse(fs.readFileSync('data/dialect_lessons_600.json', 'utf8'));
const culture = JSON.parse(fs.readFileSync('data/culture_lessons_100.json', 'utf8'));
const phrases = JSON.parse(fs.readFileSync('data/phrases_45.json', 'utf8')).phrases;
const languages = ['fr', 'am', 'so', 'ti', 'sw', 'ha', 'om'];
const counts = {};
const samples = {};
const hit = (language, field, value, source) => {
    if (typeof value === 'string' && value === source && !/[\u0600-\u06ff]/u.test(source)) {
        const key = `${language}:${field}`;
        counts[key] = (counts[key] || 0) + 1;
        samples[key] ||= { value, source };
    }
};
for (const language of languages) {
    for (const lesson of dialect.lessons) {
        for (const word of lesson.words) {
            hit(language, 'meaning', word[`meaning_${language}`], word.english);
            hit(language, 'example', word[`example_${language}`], word.example_english);
        }
        for (const question of lesson.questions) {
            hit(language, 'question', question[`question_${language}`], question.question_en);
            question[`options_${language}`].forEach((value, index) => hit(language, 'option', value, question.options[index]));
            hit(language, 'explanation', question[`explanation_${language}`], question.explanation);
        }
    }
    for (const lesson of culture.lessons) {
        for (const field of ['title', 'category', 'story']) hit(language, field, lesson[`${field}_${language}`], lesson[`${field}_en`]);
        for (const question of lesson.practice_test) question[`options_${language}`].forEach((value, index) => hit(language, 'culture_option', value, question.options[index]));
    }
    for (const phrase of phrases) {
        hit(language, 'phrase', phrase[`translation_${language}`], phrase.en);
        hit(language, 'category', phrase[`category_${language}`], phrase.cat);
        hit(language, 'level', phrase[`level_${language}`], phrase.lvl);
    }
}
console.log(JSON.stringify({ counts, samples }, null, 2));
