const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const landingHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const landingCss = fs.readFileSync(path.join(root, 'landing.css'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const favicon = fs.readFileSync(path.join(root, 'favicon.svg'), 'utf8');

test('Saleem brand mark is wired into the favicon and visible headers', () => {
    assert.match(html, /rel="icon"[^>]+favicon\.svg/);
    assert.match(html, /class="saleem-brand-mark"[^>]+src="\/favicon\.svg"/);
    assert.match(landingHtml, /class="saleem-brand-mark"[^>]+src="favicon\.svg"/);
    assert.match(css, /\.saleem-brand-mark\s*\{/);
    assert.match(favicon, /speech bubble above a bridge/);
    assert.match(favicon, /#0f766e/);
});

test('premium shell keeps localized controls wired to the existing runtime', () => {
    for (const key of [
        'aiIntro', 'aiScenarios', 'aiScenariosSub', 'scenarioCafe', 'scenarioHospital',
        'scenarioPolice', 'scenarioRental', 'scenarioTransport', 'communityIntro',
        'forumAll', 'forumLanguage', 'forumCulture', 'forumTips', 'forumStories',
        'postHeading', 'postTitlePlaceholder', 'postBodyPlaceholder', 'submitPost',
        'profileIntro', 'chatTutor', 'chatWelcome', 'quickMetro', 'quickRent',
        'quickUnhcr', 'quickPharmacy', 'chatPlaceholder', 'daysLabel',
        'sectionLearn', 'sectionLearnSub', 'dailyStreak', 'totalXp', 'jump', 'progress',
        'sectionAi', 'sectionCommunity', 'sectionProfile', 'learningSnapshot',
        'mentorHeading', 'mentorSub', 'weeklyChallenge', 'weeklyChallengeSub', 'requestMentor',
        'discussionFeed', 'moderatedSafe', 'reviewHeading', 'ratingScore',
        'reviewHelpPlaceholder', 'reviewImprovementPlaceholder', 'submitFeedback',
        'communityAverage', 'noPublicReviews', 'feedbackFeed', 'localAppProfile',
        'saleemPass', 'countryOrigin', 'saleemUserId', 'offlineCloud', 'editProfile',
        'learningMetrics', 'wordsLearned', 'phrasesMastered', 'daysStreak', 'level',
        'beginner', 'downloadOffline', 'verifiedServices', 'verifiedServicesSub',
        'searchInstitution', 'allInstitutions', 'catUnhcr', 'catImmigration', 'catHealth',
        'catLegal', 'catPolice', 'mapFallbackTitle', 'mapFallbackText'
    ]) {
        assert.match(html, new RegExp(`(?:data-i18n|data-i18n-ph)="${key}"`), `missing shell key ${key}`);
    }
    for (const language of ['fr', 'am', 'so', 'ti', 'sw', 'ha', 'om']) {
        assert.match(js, new RegExp(`\\b${language}:`), `missing localized shell language ${language}`);
    }
    assert.match(js, /const APP_SHELL_TEXT = Object\.freeze/);
    assert.match(js, /const APP_ACTION_TEXT = Object\.freeze/);
    assert.match(js, /const LEARNING_UI_TEXT = Object\.freeze/);
    assert.match(js, /am:\s*\{[\s\S]*?progressionDialect/);
    assert.match(html, /data-i18n-ph="jump"/);
    assert.match(js, /getAppActionText\('directions'\)/);
    assert.match(js, /getAppActionText\('call'\)/);
    assert.match(js, /ha:\s*\{[\s\S]*?step1_header/);
    assert.match(js, /om:\s*\{[\s\S]*?step1_header/);
});

test('premium visual system has responsive and accessible foundations', () => {
    for (const token of ['--color-primary:', '--color-secondary:', '--color-background:', '--shadow-soft:']) {
        assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /\.bottom-nav\s*\{/);
    assert.match(css, /@media\s*\(max-width:\s*767px\)/);
    assert.match(css, /env\(safe-area-inset-bottom(?:,\s*0px)?\)/);
    for (const token of ['--color-culture:', '--color-ai:', '--text-secondary:', '--fs-body:', '--fs-card-title:']) {
        assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(css, /#dialect-modal-content \[style\*="rgba\(15, 23, 42"\]/);
    assert.match(css, /@media \(max-width: 430px\)/);
});

test('editorial landing theme preserves APK and web demo entry points', () => {
    assert.match(landingHtml, /href="downloads\/saleem-v1\.0\.0\.apk"\s+download/);
    assert.match(landingHtml, /href="app\.html"/);
    assert.match(landingHtml, />Open Web Demo</);
    assert.match(landingHtml, /href="landing\.css"/);
    assert.match(landingHtml, /src="assets\/saleem-app-first-open\.png"/);
    assert.match(landingHtml, /https:\/\/www\.linkedin\.com\/company\/saleem-ai/);
    assert.match(landingCss, /\.app-screen-shot\s*\{/);
    assert.match(landingCss, /aspect-ratio:\s*390\s*\/\s*844/);
    assert.match(landingCss, /object-fit:\s*contain/);
    assert.match(landingCss, /--landing-cream:\s*#f5f0e6/);
    assert.match(landingCss, /--landing-ink:\s*#0b352f/);
    assert.match(landingCss, /--landing-coral:\s*#ef624f/);
    assert.match(landingCss, /@media \(max-width: 767px\)/);
    assert.match(js, /document\.querySelector\('\.app-layout'\)\) checkFirstTimeOnboarding\(\)/);
    assert.match(js, /assets\/saleem-app-first-open\$\{previewSuffix\}\.png/);
    for (const language of ['ar', 'fr', 'am', 'so', 'ti', 'sw', 'ha', 'om']) {
        assert.equal(fs.existsSync(path.join(root, `assets/saleem-app-first-open-${language}.png`)), true);
    }
});
