// =============================================================
// AI Routes - Proxy for AI chat, translation (keys stay server-side)
// =============================================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { sanitizeHtml } = require('../middleware/sanitize');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SUPPORTED_LANGUAGE_CODES = new Set(['en', 'ar', 'am', 'so', 'fr', 'ti', 'sw', 'ha', 'om']);

function normalizePreferredLanguage(language) {
    return SUPPORTED_LANGUAGE_CODES.has(language) ? language : 'en';
}

function getVerifiedServiceContext(db, need = '', city = '', category = '') {
    if (!db) return '';
    const tokens = String(need).toLowerCase().split(/\s+/).filter(token => token.length > 2).slice(0, 8);
    const normalizedCity = String(city).trim().toLowerCase();
    const normalizedCategory = String(category).trim().toLowerCase();
    const rows = db.prepare("SELECT name, category, description, address, city, phone, website, source_name, source_url, last_verified_at FROM resources WHERE verification_status = 'verified' AND is_demo_data = 0 ORDER BY last_verified_at DESC, name LIMIT 50").all();
    const matches = rows.map(row => {
        const haystack = `${row.name} ${row.category} ${row.description || ''} ${row.address || ''} ${row.city || ''}`.toLowerCase();
        const score = (normalizedCategory && row.category === normalizedCategory ? 30 : 0)
            + (normalizedCity && String(row.city || '').toLowerCase() === normalizedCity ? 20 : 0)
            + tokens.filter(token => haystack.includes(token)).length * 5
            + (row.source_url ? 5 : 0);
        return { row, score };
    }).filter(item => item.score > 0 || (!tokens.length && !normalizedCity && !normalizedCategory))
        .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name)).slice(0, 5).map(item => item.row);
    if (!matches.length) return '';
    return `\nVERIFIED SERVICE DIRECTORY RESULTS (source-backed records only; do not invent or alter these details):\n${matches.map(row => `- ${row.name} | ${row.category} | ${row.city || 'Egypt'} | ${row.address || 'Address not listed'} | ${row.phone || 'Phone not listed'} | ${row.source_url || 'Source link not listed'} | checked ${row.last_verified_at || 'date not listed'}`).join('\n')}\nIf no record matches the user's need, say that no matching verified record was found and direct the user to choose a category or area in the directory. Never provide a made-up service, route, distance, phone number, or opening time.`;
}

// Default model prioritization on Groq API: llama-3.3-70b-versatile
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const UNHCR_EGYPT_FALLBACK = `UNHCR Egypt registration and document services:
- Reception Centre: 17 Mecca El-Mokarrama Street, 7th District, 6th of October City
- Infoline: 0231330000
- Many services require an appointment or SMS/call from UNHCR before entry
- Bring your UNHCR case number or identity documents and any appointment details

*Note: This was checked against UNHCR Egypt public information on 2026-08-11. Verify current procedures before travel.*`;

// Unified AI Completions Call Helper
async function callLLMCompletions(messages, maxTokens = 1024, temperature = 0.6) {
    // 1. DeepSeek Official API (DeepSeek-V3 / DeepSeek-R1)
    if (DEEPSEEK_API_KEY) {
        try {
            const modelName = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
            const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: modelName,
                    messages,
                    temperature,
                    max_tokens: maxTokens
                }),
                signal: AbortSignal.timeout(30000)
            });
            if (res.ok) {
                const data = await res.json();
                return { text: data.choices?.[0]?.message?.content?.trim(), provider: `DeepSeek (${modelName})` };
            }
        } catch (e) {
            console.warn('DeepSeek Direct API fallback triggered:', e.message);
        }
    }

    // 2. OpenRouter API (DeepSeek R1 / V3 Free Tier)
    if (OPENROUTER_API_KEY) {
        try {
            const modelName = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-r1:free';
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://saleem-eight.vercel.app',
                    'X-Title': 'SALEEM Refugee AI'
                },
                body: JSON.stringify({
                    model: modelName,
                    messages,
                    temperature,
                    max_tokens: maxTokens
                }),
                signal: AbortSignal.timeout(30000)
            });
            if (res.ok) {
                const data = await res.json();
                return { text: data.choices?.[0]?.message?.content?.trim(), provider: `OpenRouter (${modelName})` };
            }
        } catch (e) {
            console.warn('OpenRouter API fallback triggered:', e.message);
        }
    }

    // 3. Groq API (High Performance Llama 3.3 70B / Qwen)
    if (GROQ_API_KEY) {
        try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'SALEEM-AI/1.0'
                },
                body: JSON.stringify({
                    model: AI_MODEL,
                    messages,
                    temperature,
                    max_tokens: maxTokens
                }),
                signal: AbortSignal.timeout(30000)
            });
            if (res.ok) {
                const data = await res.json();
                return { text: data.choices?.[0]?.message?.content?.trim(), provider: `Groq (${AI_MODEL})` };
            }
        } catch (e) {
            console.warn('Groq API fallback triggered:', e.message);
        }
    }

    return null;
}

// System prompt for Saleem AI (Enriched with Refugee Services Chatbot Dataset v2.0 - 3,000 Examples)
function buildSystemPrompt(userName, nationality, language) {
    return `You are Saleem AI, a warm multilingual integration assistant for refugees and displaced people navigating daily life in Egypt. Use the embedded Saleem directory and general practical guidance; do not invent addresses, phone numbers, eligibility rules, statistics, partnerships, testimonials, or official status. For legal, medical, immigration, or protection questions, explain that information can change and the user should verify with the official provider before taking action.

USER CONTEXT:
- Name: ${userName || 'Friend'}
- Origin/Nationality: ${nationality || 'Abroad'}
- Preferred Language: ${language || 'English'}
- Language contract: respond only in the preferred language and Egyptian Arabic. Do not add English unless English is the preferred language. Do not silently switch to another language.

KNOWLEDGE BASE & REFUGEE SERVICES DIRECTORY (EGYPT):
1. UNHCR & LEGAL AID (استشارة قانونية ووثائق اللجوء):
   - UNHCR Egypt Reception Centre: 17 Mecca El-Mokarrama Street, 7th District, 6th of October City. Verify appointment rules directly with UNHCR Egypt before visiting.
   - Verified Legal Partners: StARS (Saint Andrew's Refugee Services), ECRR (Egyptian Council for Refugee Rights). Legal consultation for residency permits (تصريح إقامة), asylum protection (حماية دولية), and refugee rights.

2. HOUSING & ACCOMMODATION (مسكن وسكن):
   - Key Refugee Neighborhoods: Faisal, 6th of October, Maadi, Nasr City, Ain Shams, Ard El Lewa.
   - Lease Protocol: Always request a formal written lease contract (عقد إيجار - Aqd Igar). For emergency shelter support, contact UNHCR / Catholic Relief Services (CRS).

3. HEALTHCARE & PSYCHOSOCIAL (خدمات صحية ونفسية وتأمين):
   - Emergency Medical: Call 123 (Egyptian Ambulance).
   - Medical & Mental Health Partners: Caritas Egypt, Egyptian Red Crescent, PSTIC (Psychosocial Services and Training Institute in Cairo) for free trauma counseling and mental health.
   - Public Hospitals: Accessible to refugees with UNHCR card at national rates.

4. EDUCATION & CHILD REGISTRATION (تسجيل الأطفال والشهادات):
   - Egyptian public and community schools accept refugee children with UNHCR card, birth certificate (شهادة ميلاد), and passport.
   - Birth certificates for children born in Egypt are issued at the local Civil Status Office (مكتب الحالة المدنية).

5. WORK, TRAINING & FINANCIAL (عمل، تدريب مهني، ودعم مالي):
   - Work & Vocational Training: IRC (International Rescue Committee) & CRS provide free vocational training (sewing, mobile repair, electrical, computing).
   - Financial Support & Banking: Cash assistance prioritized for families with children/elderly. Bank accounts can be opened at major Egyptian banks with UNHCR card or passport.

 6. DYNAMIC DIALECT & LANGUAGE INSTRUCTIONS:
    - Speak in the preferred language above together with Egyptian Arabic (عامية مصرية) only. Keep Egyptian expressions authentic and do not replace them with Modern Standard Arabic.
   - Maintain a friendly, empowering, and respectful tone at all times. Use clear formatting and bullet points.`;
}

// POST /api/ai/chat - Send message to AI
router.post('/chat', optionalAuth, async (req, res) => {
    try {
        const { message, conversation_id, scenario, primary_language, service_need, service_city, service_category } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        const cleanMessage = sanitizeHtml(message).substring(0, 2000);
        const db = req.app.locals.contentDb || req.app.locals.db;
        const durableDb = req.app.locals.userDb;

        // Get or create conversation
        let convId = conversation_id;
        if (req.user) {
            if (!convId) {
                convId = uuidv4();
                if (durableDb) await durableDb.createConversation(convId, req.user.id, cleanMessage.substring(0, 100));
                else db.prepare('INSERT INTO chat_conversations (id, user_id, title) VALUES (?, ?, ?)').run(convId, req.user.id, cleanMessage.substring(0, 100));
            }
            // Save user message
            if (durableDb) await durableDb.addChatMessage(uuidv4(), convId, 'user', cleanMessage);
            else db.prepare("INSERT INTO chat_messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)").run(uuidv4(), convId, cleanMessage);
        }

        // Build message history
        let historyMessages = [];
        if (convId && req.user) {
            const recentMessages = durableDb
                ? await durableDb.getRecentMessages(convId)
                : db.prepare('SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10').all(convId);
            historyMessages = recentMessages.reverse();
        }

        // Get user info for personalization
        let userName = 'Friend';
        let nationality = 'abroad';
        let language = normalizePreferredLanguage(primary_language);
        if (req.user) {
            const user = durableDb
                ? await durableDb.getUserById(req.user.id)
                : db.prepare('SELECT name, nationality, preferred_language FROM users WHERE id = ?').get(req.user.id);
            if (user) {
                userName = user.name;
                nationality = user.nationality;
                language = normalizePreferredLanguage(user.preferred_language || language);
            }
        }

        const systemPrompt = buildSystemPrompt(userName, nationality, language) + getVerifiedServiceContext(db, service_need, service_city, service_category);

        // Build messages payload
        const messages = [
            { role: 'system', content: systemPrompt },
            ...historyMessages.slice(0, -1), // Exclude the message we just saved
            { role: 'user', content: cleanMessage }
        ];

        // Call LLM engine (DeepSeek V3 / R1 -> OpenRouter -> Groq fallback)
        const llmResult = await callLLMCompletions(messages, 1024, 0.6);

        if (!llmResult || !llmResult.text) {
            const fallback = generateFallbackResponse(cleanMessage, userName, language);
            if (req.user && convId) {
                if (durableDb) await durableDb.addChatMessage(uuidv4(), convId, 'assistant', fallback);
                else db.prepare("INSERT INTO chat_messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)").run(uuidv4(), convId, fallback);
            }
            return res.json({ response: fallback, conversation_id: convId, source: 'fallback' });
        }

        const aiResponse = llmResult.text;

        // Save assistant message
        if (req.user && convId) {
            if (durableDb) {
                await durableDb.addChatMessage(uuidv4(), convId, 'assistant', aiResponse);
                await durableDb.touchConversation(convId);
            } else {
                db.prepare("INSERT INTO chat_messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)").run(uuidv4(), convId, aiResponse);
                db.prepare("UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?").run(convId);
            }
        }

        // Track analytics
        if (req.user) {
                if (durableDb) await durableDb.recordAnalytics(req.user.id, 'ai_message_sent');
                else db.prepare("INSERT INTO analytics_events (user_id, event_type) VALUES (?, 'ai_message_sent')").run(req.user.id);
        }

        res.json({ response: aiResponse, conversation_id: convId, source: 'ai', provider: llmResult.provider });
    } catch (err) {
        console.error('AI chat error:', err);
        res.status(500).json({ error: 'Saleem AI is temporarily unavailable. Please try again in a moment.' });
    }
});

// POST /api/ai/translate - Translation via AI
router.post('/translate', optionalAuth, async (req, res) => {
    try {
        const { text, primary_language } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text to translate is required.' });
        }

        const cleanText = sanitizeHtml(text).substring(0, 2000);

        let preferredLanguage = normalizePreferredLanguage(primary_language);
        if (req.user) {
            const user = req.app.locals.userDb
                ? await req.app.locals.userDb.getUserById(req.user.id)
                : req.app.locals.db.prepare('SELECT preferred_language FROM users WHERE id = ?').get(req.user.id);
            preferredLanguage = normalizePreferredLanguage(user?.preferred_language || preferredLanguage);
        }
        const effectiveSource = req.body.source_lang === 'ar_eg' ? 'ar_eg' : preferredLanguage;
        const effectiveTarget = effectiveSource === 'ar_eg' ? preferredLanguage : 'ar_eg';

        const langLabels = {
            en: 'English', ar: 'Arabic', ar_eg: 'Egyptian Colloquial Arabic (عامية مصرية)',
            am: 'Amharic (አማርኛ)', so: 'Somali (Soomaali)', fr: 'French (Français)',
            ti: 'Tigrinya (ትግርኛ)', sw: 'Swahili (Kiswahili)', ha: 'Hausa', om: 'Oromo (Afaan Oromoo)'
        };

        const sourceLabel = langLabels[effectiveSource] || effectiveSource;
        const targetLabel = langLabels[effectiveTarget] || effectiveTarget;

        const translateMessages = [
            {
                role: 'system',
                content: `You are an expert Egyptian dialect translator trained on authentic Cairo عامية مصرية vocabulary.
Translate from ${sourceLabel} to ${targetLabel}.

EGYPTIAN DIALECT DICTIONARY RULES & EXPRESSIONS:
- "awesome / perfect": قشطة وزي الفل (Qishta wa zei el-ful)
- "deal / settled": خلصانة بشياكة (Khalsana bi-sheyaka)
- "mixed up / confused": ملخبط (Malkhabat)
- "really / is it possible": معقول؟ (Ma'qool?)
- "good / fine": كويس (Kwayyes)
- "bad / terrible": وحش (Wahsh)
- "expensive / crowded": غالي (Ghali)
- "what": إيه؟ (Eh?)
- "well done / great job": تسلم إيدك / عاشت إيدك / الله ينور
- "surprise / wow": ياااه (Yaaah)
- "enough / that's it": خلاص (Khlas)
- "let's go / hurry": يلا بينا (Yalla bina)
- "agreed / okay": ماشي (Mashi)
- "nobody": محدش (Mahdesh)
- "something": حاجة (Haja)
- "tired": تعبان (Ta'aban)
- "smart / clever": شاطر (Shater)
- "upset": زعلان (Za'lan)
- "hungry / thirsty / sleepy": جوعان / عطشان / نعسان
- "belonging to / of": بتاع (Bita')
- "pull over driver": على جنب يا اسطى (Ala gamb ya osta)
- "how much is this": بكم ده؟ (Bikam dah?)

Provide:
1. The natural translation
2. If translating to/from Egyptian Arabic, include a phonetic pronunciation guide ("How to say in your language")
3. A brief cultural/usage note about dialect nuances`
            },
            { role: 'user', content: cleanText }
        ];

        const llmResult = await callLLMCompletions(translateMessages, 512, 0.3);

        if (!llmResult || !llmResult.text) {
            // Fallback to MyMemory
            try {
                const langPair = `${effectiveSource === 'ar_eg' ? 'ar' : effectiveSource}|${effectiveTarget === 'ar_eg' ? 'ar' : effectiveTarget}`;
                const mmResponse = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${langPair}`);
                const mmData = await mmResponse.json();
                if (mmData?.responseData?.translatedText) {
                    return res.json({ translation: mmData.responseData.translatedText, source: 'mymemory' });
                }
            } catch (e) { /* ignore fallback error */ }

            return res.status(502).json({ error: 'Translation service temporarily unavailable.' });
        }

        const translation = llmResult.text;

        // Save to history if authenticated
        if (req.user) {
            const durableDb = req.app.locals.userDb;
            if (durableDb) await durableDb.saveTranslation({ id: uuidv4(), user_id: req.user.id, source_text: cleanText, translated_text: translation, source_lang: effectiveSource, target_lang: effectiveTarget });
            else req.app.locals.db.prepare('INSERT INTO translation_history (id, user_id, source_text, translated_text, source_lang, target_lang) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.user.id, cleanText, translation, effectiveSource, effectiveTarget);
        }

        res.json({ translation, source: 'ai', provider: llmResult.provider });
    } catch (err) {
        console.error('Translation error:', err);
        res.status(500).json({ error: 'Translation service temporarily unavailable. Please try again.' });
    }
});

// GET /api/ai/conversations - Get user's conversation history
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const conversations = req.app.locals.userDb
            ? await req.app.locals.userDb.getConversations(req.user.id)
            : db.prepare('SELECT * FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20').all(req.user.id);
        res.json({ conversations });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load conversations.' });
    }
});

// GET /api/ai/conversations/:id/messages - Get messages in a conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
    try {
        const db = req.app.locals.db;
        // Verify ownership
        const conv = req.app.locals.userDb
            ? await req.app.locals.userDb.getConversation(req.params.id, req.user.id)
            : db.prepare('SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
        if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

        const messages = req.app.locals.userDb
            ? await req.app.locals.userDb.getMessages(req.params.id)
            : db.prepare('SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY created_at').all(req.params.id);
        res.json({ messages });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load messages.' });
    }
});

// Fallback response generator
function generateFallbackResponse(message, userName, language = 'en') {
    if (language !== 'en') {
        return `أهلاً ${userName || ''}! خدمة المساعد غير متاحة الآن. يمكنني مساعدتك بالمحتوى المصري المحفوظ ودليل الخدمات الموثوق. يرجى التأكد من المعلومات القانونية أو الطبية العاجلة مع الجهة الرسمية.`;
    }
    const lower = message.toLowerCase();
    if (lower.includes('metro') || lower.includes('مترو')) {
        return `The Cairo Metro has 3 main lines:\n• Line 1 (Helwan ↔ El-Marg): Red line\n• Line 2 (Shobra ↔ El-Mounib): Yellow line\n• Line 3 (Airport ↔ Kit Kat): Green line\n\nTicket prices: 6-15 EGP depending on stations. Ladies-only carriages are in the center of every train.\n\n*Note: This is general information. Please verify current fares at the station.*`;
    }
    if (lower.includes('apartment') || lower.includes('rent') || lower.includes('سكن') || lower.includes('إيجار')) {
        return `When renting in Cairo, always:\n• Get a formal written lease (Aqd Igar - عقد إيجار)\n• Have it stamped at the Shari3 Al-3aqari (Real Estate Office)\n• Keep receipts for all payments\n• Popular areas: Faisal, Maadi, Nasr City, 6th of October\n\n*Note: For legal help with rental issues, contact StARS legal aid.*`;
    }
    if (lower.includes('unhcr') || lower.includes('مفوضية') || lower.includes('yellow card')) {
        return UNHCR_EGYPT_FALLBACK;
    }
    return `Ahlan ${userName}! I'm Saleem AI. I can help with:\n• Egyptian Arabic phrases & translations\n• Cairo transportation & navigation\n• UNHCR registration & legal guidance\n• Finding local services & resources\n\nPlease ask me anything about life in Egypt!`;
}

module.exports = router;
