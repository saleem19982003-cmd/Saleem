const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('premium shell keeps localized controls wired to the existing runtime', () => {
    for (const key of [
        'aiIntro', 'aiScenarios', 'aiScenariosSub', 'scenarioCafe', 'scenarioHospital',
        'scenarioPolice', 'scenarioRental', 'scenarioTransport', 'communityIntro',
        'forumAll', 'forumLanguage', 'forumCulture', 'forumTips', 'forumStories',
        'postHeading', 'postTitlePlaceholder', 'postBodyPlaceholder', 'submitPost',
        'profileIntro', 'chatTutor', 'chatWelcome', 'quickMetro', 'quickRent',
        'quickUnhcr', 'quickPharmacy', 'chatPlaceholder'
    ]) {
        assert.match(html, new RegExp(`(?:data-i18n|data-i18n-ph)="${key}"`), `missing shell key ${key}`);
    }
    for (const language of ['fr', 'am', 'so', 'ti', 'sw', 'ha', 'om']) {
        assert.match(js, new RegExp(`\\b${language}:`), `missing localized shell language ${language}`);
    }
});

test('premium visual system has responsive and accessible foundations', () => {
    for (const token of ['--color-primary:', '--color-secondary:', '--color-background:', '--shadow-soft:']) {
        assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /\.bottom-nav\s*\{/);
    assert.match(css, /@media\s*\(max-width:\s*767px\)/);
    assert.match(css, /env\(safe-area-inset-bottom(?:,\s*0px)?\)/);
});
