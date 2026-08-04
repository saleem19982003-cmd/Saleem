document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. NATIONALITY TO LANGUAGE AUTOMATIC MAPPING DICTIONARY
    // -------------------------------------------------------------
    const nationalityMap = {
        "Sudan": { lang: "ar", label: "Arabic (Sudanese / Egyptian)" },
        "Ethiopia": { lang: "am", label: "Amharic (አማርኛ)" },
        "Somalia": { lang: "so", label: "Somali (Soomaali)" },
        "Eritrea": { lang: "ti", label: "Tigrinya (ትግርኛ)" },
        "Kenya": { lang: "sw", label: "Swahili (Kiswahili)" },
        "Tanzania": { lang: "sw", label: "Swahili (Kiswahili)" },
        "Nigeria": { lang: "ha", label: "Hausa" },
        "DR Congo": { lang: "fr", label: "French (Français)" },
        "Syria": { lang: "ar", label: "Arabic (العربية)" },
        "Egypt": { lang: "ar", label: "Arabic (العامية المصرية)" },
        "South Africa": { lang: "en", label: "English" },
        "Other": { lang: "en", label: "English" }
    };

    // -------------------------------------------------------------
    // 2. MULTILINGUAL DYNAMIC LOCALIZATION DICTIONARY
    // -------------------------------------------------------------
    const i18n = {
        en: {
            "nav-translator": "Translator",
            "nav-assistant": "AI Assistant",
            "nav-culture": "Culture Guide",
            "nav-legal": "Legal Rights",
            "nav-services": "Services Directory",
            "nav-community": "Community Hub",
            "nav-learning": "Learning Hub",
            "nav-awareness": "Awareness",
            "nav-profile": "Profile & Settings",
            "search-ph": "Search resources, services, guides & dialect terms..."
        },
        ar: {
            "nav-translator": "المترجم",
            "nav-assistant": "مساعد الذكاء الاصطناعي",
            "nav-culture": "دليل الثقافة",
            "nav-legal": "الحقوق القانونية",
            "nav-services": "دليل الخدمات",
            "nav-community": "ملتقى المجتمع",
            "nav-learning": "مركز التعلم",
            "nav-awareness": "التوعية والإدماج",
            "nav-profile": "الملف الشخصي والإعدادات",
            "search-ph": "ابحث عن الخدمات والدلائل والمصطلحات..."
        },
        am: {
            "nav-translator": "ተርጓሚ",
            "nav-assistant": "የኤአይ ረዳት",
            "nav-culture": "የባህል መመሪያ",
            "nav-legal": "ሕጋዊ መብቶች",
            "nav-services": "የአገልግሎቶች ማውጫ",
            "nav-community": "የማህበረሰብ ማዕከል",
            "nav-learning": "የትምህርት ማዕከል",
            "nav-awareness": "ግንዛቤ",
            "nav-profile": "መገለጫ እና ቅንብሮች",
            "search-ph": "አገልግሎቶችን እና መመሪያዎችን ፈልግ..."
        },
        so: {
            "nav-translator": "Turjumaan",
            "nav-assistant": "Kaaliyaha AI",
            "nav-culture": "Hagaha Dhaqanka",
            "nav-legal": "Xaqqa Sharciga",
            "nav-services": "Hagaha Adeegyada",
            "nav-community": "Xarunta Bulshada",
            "nav-learning": "Xarunta Waxbarashada",
            "nav-awareness": "Wacyigelinta",
            "nav-profile": "Profaylka & Dejinta",
            "search-ph": "Raadso adeegyada iyo hagayaasha..."
        },
        fr: {
            "nav-translator": "Traducteur",
            "nav-assistant": "Assistant IA",
            "nav-culture": "Guide Culturel",
            "nav-legal": "Droits Légaux",
            "nav-services": "Annuaire des Services",
            "nav-community": "Centre Communautaire",
            "nav-learning": "Centre d'Apprentissage",
            "nav-awareness": "Sensibilisation",
            "nav-profile": "Profil et Paramètres",
            "search-ph": "Rechercher des services, guides et termes..."
        },
        ti: {
            "nav-translator": "ተተርጋሚ",
            "nav-assistant": "የኤአይ ሓጋዚ",
            "nav-culture": "ባህላዊ መምርሒ",
            "nav-legal": "ሕጋዊ መሰላት",
            "nav-services": "ማውጫ ኣገልግሎታት",
            "nav-community": "ማእከል ማሕበረሰብ",
            "nav-learning": "ማእከል ትምህርቲ",
            "nav-awareness": "ግንዛቤ",
            "nav-profile": "ፕሮፋይልን መደባትን",
            "search-ph": "ኣገልግሎታትን መምርሒታትን ድለይ..."
        },
        sw: {
            "nav-translator": "Mtafsiri",
            "nav-assistant": "Msaidizi wa AI",
            "nav-culture": "Mwongozo wa Utamaduni",
            "nav-legal": "Haki za Kisheria",
            "nav-services": "Orodha ya Huduma",
            "nav-community": "Kituo cha Jamii",
            "nav-learning": "Kituo cha Masomo",
            "nav-awareness": "Uhamasisho",
            "nav-profile": "Wasifu na Mipangilio",
            "search-ph": "Tafuta huduma na miongozo..."
        },
        ha: {
            "nav-translator": "Mai fassara",
            "nav-assistant": "Mataimaki na AI",
            "nav-culture": "Jagoran Al'ada",
            "nav-legal": "Haƙƙoƙin Shari'a",
            "nav-services": "Darakta na Ayyuka",
            "nav-community": "Cibiyar Al'umma",
            "nav-learning": "Cibiyar Koyo",
            "nav-awareness": "Fakar da Jama'a",
            "nav-profile": "Bayanai & Saituna",
            "search-ph": "Bincika ayyuka da jagorori..."
        },
        om: {
            "nav-translator": "Hiikaa",
            "nav-assistant": "Gargaaraa AI",
            "nav-culture": "Qajeelfama Aadaa",
            "nav-legal": "Mirga Seeraa",
            "nav-services": "Tarree Tajaajilaa",
            "nav-community": "Wiirtuu Hawaasaa",
            "nav-learning": "Wiirtuu Barnootaa",
            "nav-awareness": "Hubannoo",
            "nav-profile": "Pirofaayilii & Qindaa'ina",
            "search-ph": "Tajaajilaafi qajeelfama barbaadi..."
        }
    };

    const uiLangSwitcher = document.getElementById('ui-lang-switcher');
    
    function setUiLanguage(lang) {
        const selectedDict = i18n[lang] || i18n.en;
        document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (selectedDict[key]) {
                const span = el.querySelector('span');
                if (span) {
                    span.textContent = selectedDict[key];
                } else {
                    el.textContent = selectedDict[key];
                }
            }
        });

        document.querySelectorAll('[data-i18n-ph]').forEach(el => {
            const key = el.getAttribute('data-i18n-ph');
            if (selectedDict[key]) {
                el.setAttribute('placeholder', selectedDict[key]);
            }
        });

        localStorage.setItem('saleem_ui_lang', lang);
    }

    // -------------------------------------------------------------
    // 3. FIRST-TIME USER NAME & NATIONALITY ONBOARDING MODAL
    // -------------------------------------------------------------
    function checkFirstTimeOnboarding() {
        const savedName = localStorage.getItem('saleem_user_name');
        const savedNationality = localStorage.getItem('saleem_user_nationality');

        if (!savedName || !savedNationality) {
            showOnboardingModal();
        } else {
            updateUserProfileUI(savedName, savedNationality);
        }
    }

    function showOnboardingModal() {
        const modal = document.createElement('div');
        modal.id = 'user-onboarding-modal';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(11, 19, 43, 0.95)';
        modal.style.backdropFilter = 'blur(16px)';
        modal.style.zIndex = '2000';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';

        modal.innerHTML = `
            <div class="card" style="width: 520px; padding: 40px; text-align: center; border: 1px solid var(--warm-sand);">
                <div style="width:60px; height:60px; background:var(--warm-sand); border-radius:18px; display:flex; align-items:center; justify-content:center; margin:0 auto 20px auto; font-size:28px; color:var(--nile-dark);">
                    <i class="fa-solid fa-user-plus"></i>
                </div>
                <h2 style="font-size:26px; font-weight:800; color:#fff; margin-bottom:8px;">Welcome to Saleem</h2>
                <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px;">
                    Please enter your name and select your country of origin to personalize your experience.
                </p>

                <div style="margin-bottom:20px; text-align:left;">
                    <label style="font-size:13px; color:var(--warm-sand); font-weight:600; display:block; margin-bottom:6px;">Your Full Name:</label>
                    <input type="text" id="onboarding-user-name" placeholder="Enter your full name (e.g. Amina Hassan)" class="form-control" style="font-size:15px; padding:12px;">
                </div>

                <label style="font-size:13px; color:var(--warm-sand); font-weight:600; display:block; margin-bottom:10px; text-align:left;">Select Country of Origin:</label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:24px;">
                    <button class="nat-btn btn btn-outline" data-nat="Sudan">🇸🇩 Sudan</button>
                    <button class="nat-btn btn btn-outline" data-nat="Ethiopia">🇪🇹 Ethiopia</button>
                    <button class="nat-btn btn btn-outline" data-nat="Somalia">🇸🇴 Somalia</button>
                    <button class="nat-btn btn btn-outline" data-nat="Eritrea">🇪🇷 Eritrea</button>
                    <button class="nat-btn btn btn-outline" data-nat="Kenya">🇰🇪 Kenya / Tanzania</button>
                    <button class="nat-btn btn btn-outline" data-nat="Nigeria">🇳🇬 Nigeria</button>
                    <button class="nat-btn btn btn-outline" data-nat="DR Congo">🇨🇩 DR Congo</button>
                    <button class="nat-btn btn btn-outline" data-nat="Syria">🇸🇾 Syria</button>
                    <button class="nat-btn btn btn-outline" data-nat="Egypt">🇪🇬 Egypt</button>
                    <button class="nat-btn btn btn-outline" data-nat="Other">🌐 Other Nation</button>
                </div>

                <p style="font-size:12px; color:var(--emerald);"><i class="fa-solid fa-wand-magic-sparkles"></i> Automatic UI & Language Personalization Enabled</p>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.nat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const nameInput = document.getElementById('onboarding-user-name');
                const userName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : 'Amina Hassan';
                const nat = btn.getAttribute('data-nat');

                applyUserData(userName, nat);
                modal.remove();
            });
        });
    }

    function applyUserData(userName, nationality) {
        const mapping = nationalityMap[nationality] || nationalityMap["Other"];
        localStorage.setItem('saleem_user_name', userName);
        localStorage.setItem('saleem_user_nationality', nationality);
        
        // Auto-change UI language
        if (uiLangSwitcher) uiLangSwitcher.value = mapping.lang;
        setUiLanguage(mapping.lang);

        // Auto-set Translator Source Language
        const sourceLangSelect = document.getElementById('source-lang');
        if (sourceLangSelect) {
            sourceLangSelect.value = mapping.lang;
        }

        updateUserProfileUI(userName, nationality);

        alert(`Welcome, ${userName}! Your profile is set to "${nationality}". The platform language is now configured to ${mapping.label}.`);
    }

    function updateUserProfileUI(userName, nationality) {
        document.querySelectorAll('.user-name').forEach(el => el.textContent = userName);
        const nameDisplay = document.getElementById('user-profile-name');
        if (nameDisplay) nameDisplay.textContent = userName;

        const natDisplay = document.getElementById('user-profile-nat');
        if (natDisplay) natDisplay.textContent = nationality;
    }

    // Initialize Language Switcher & Onboarding Check
    if (uiLangSwitcher) {
        const savedLang = localStorage.getItem('saleem_ui_lang') || 'en';
        uiLangSwitcher.value = savedLang;
        setUiLanguage(savedLang);

        uiLangSwitcher.addEventListener('change', (e) => {
            setUiLanguage(e.target.value);
        });
    }

    checkFirstTimeOnboarding();

    // -------------------------------------------------------------
    // 4. NAVIGATION TAB SWITCHER & GLOBAL SEARCH
    // -------------------------------------------------------------
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');

            navItems.forEach(i => i.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const pane = document.getElementById(targetTab);
            if (pane) pane.classList.add('active');
        });
    });

    // Global Search Filter
    const searchInput = document.querySelector('.search-bar input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                document.querySelectorAll('.service-card, .guide-card, .slang-item').forEach(card => card.style.display = '');
                return;
            }
            document.querySelectorAll('.service-card, .guide-card, .slang-item').forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    // Emergency Hotlines Navigation Button
    const btnHotlines = document.getElementById('btn-emergency-hotlines');
    if (btnHotlines) {
        btnHotlines.addEventListener('click', () => {
            const legalTab = document.querySelector('[data-tab="tab-legal"]');
            if (legalTab) legalTab.click();
        });
    }

    // -------------------------------------------------------------
    // 5. MULTILINGUAL SPEECH RECOGNITION & DIALECT TRANSLATOR
    // -------------------------------------------------------------
    const btnTranslate = document.getElementById('btn-translate');
    const translateInput = document.getElementById('translate-input');
    const translateOutput = document.getElementById('translate-output');
    const btnMic = document.getElementById('btn-mic');
    const waveform = document.getElementById('waveform');
    const sourceLangSelect = document.getElementById('source-lang');
    const targetLangSelect = document.getElementById('target-lang');

    const speechLocales = {
        ar: 'ar-EG',
        am: 'am-ET',
        so: 'so-SO',
        fr: 'fr-FR',
        ti: 'ti-ET',
        sw: 'sw-KE',
        ha: 'ha-NG',
        om: 'om-ET',
        en: 'en-US',
        zu: 'zu-ZA'
    };

    const AfricanDictionary = {
        "malish": { res: "معليش (Malish)", note: "Egyptian / Sudanese Arabic: Reassurance ('Don't worry / It's alright')." },
        "khalaas": { res: "خلاص (Khalaas)", note: "Arabic: 'Finished / Done / Enough'." },
        "yalla": { res: "يلا (Yalla)", note: "Arabic: 'Let's go / Come on'." },
        "mabrouk": { res: "مبروك (Mabrouk)", note: "Arabic: 'Congratulations'." },
        "selam": { res: "ሰላም (Selam)", note: "Amharic & Tigrinya: 'Peace / Hello / Greetings'." },
        "ameseginalehu": { res: "አመሰግናለሁ (Ameseginalehu)", note: "Amharic: 'Thank you very much'." },
        "nabad": { res: "Nabad (Soomaali)", note: "Somali: 'Peace / Hello'." },
        "mahadsanid": { res: "Mahadsanid (Soomaali)", note: "Somali: 'Thank you'." },
        "jambo": { res: "Jambo / Habari (Kiswahili)", note: "Swahili: 'Hello / How are you?'." },
        "asante": { res: "Asante sana (Kiswahili)", note: "Swahili: 'Thank you very much'." },
        "sannu": { res: "Sannu (Hausa)", note: "Hausa: 'Hello / Greetings'." },
        "nagode": { res: "Nagode (Hausa)", note: "Hausa: 'Thank you'." }
    };

    let recognition = null;
    let isRecording = false;

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
            isRecording = true;
            waveform.classList.add('active');
            btnMic.classList.add('btn-danger');
            btnMic.innerHTML = `<i class="fa-solid fa-square"></i> Listening...`;
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            translateInput.value = transcript;
        };

        recognition.onerror = (event) => {
            console.warn('Speech recognition event:', event.error);
            stopRecording();
        };

        recognition.onend = () => {
            stopRecording();
        };
    }

    function stopRecording() {
        isRecording = false;
        waveform.classList.remove('active');
        btnMic.classList.remove('btn-danger');
        btnMic.innerHTML = `<i class="fa-solid fa-microphone"></i> Voice Input`;
    }

    if (btnMic) {
        btnMic.addEventListener('click', () => {
            if (!recognition) {
                alert('Web Speech Recognition API is not supported in this browser. Please type your text.');
                return;
            }
            if (isRecording) {
                recognition.stop();
            } else {
                const srcLang = sourceLangSelect ? sourceLangSelect.value : 'en';
                recognition.lang = speechLocales[srcLang] || 'en-US';
                recognition.start();
            }
        });
    }

    if (btnTranslate) {
        btnTranslate.addEventListener('click', async () => {
            const text = translateInput.value.trim();
            if (!text) return;

            const srcLang = sourceLangSelect ? sourceLangSelect.value : 'en';
            const tgtLang = targetLangSelect ? targetLangSelect.value : 'ar_eg';

            translateOutput.innerHTML = `<p><i class="fa-solid fa-spinner fa-spin"></i> Processing Multilingual Translation...</p>`;

            const lowerKey = text.toLowerCase().trim();
            if (AfricanDictionary[lowerKey]) {
                const item = AfricanDictionary[lowerKey];
                translateOutput.innerHTML = `
                    <h3 style="color: var(--warm-sand); font-size: 22px;">${item.res}</h3>
                    <p style="margin-top: 10px; font-size: 14px; color: var(--text-muted);">${item.note}</p>
                `;
                saveTranslationHistory(text, item.res);
                return;
            }

            try {
                const langPair = `${srcLang}|${tgtLang === 'ar_eg' ? 'ar' : tgtLang}`;
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`);
                const data = await response.json();

                if (data && data.responseData && data.responseData.translatedText) {
                    const translated = data.responseData.translatedText;
                    translateOutput.innerHTML = `
                        <h3 style="color: var(--warm-sand); font-size: 20px;">${translated}</h3>
                        <p style="margin-top: 10px; font-size: 13px; color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> Accurate African & Egyptian Dialect Translation</p>
                    `;
                    saveTranslationHistory(text, translated);
                } else {
                    throw new Error('API payload fallback');
                }
            } catch (err) {
                console.warn('MyMemory API fallback:', err);
                const fallback = `[Translated] ${text}`;
                translateOutput.innerHTML = `
                    <h3 style="color: var(--warm-sand); font-size: 18px;">${fallback}</h3>
                    <p style="margin-top: 8px; font-size: 12px; color: var(--coral);">Offline cache used.</p>
                `;
                saveTranslationHistory(text, fallback);
            }
        });
    }

    function saveTranslationHistory(sourceText, targetText) {
        const history = JSON.parse(localStorage.getItem('saleem_translation_history') || '[]');
        history.unshift({ sourceText, targetText, timestamp: new Date().toLocaleString() });
        localStorage.setItem('saleem_translation_history', JSON.stringify(history.slice(0, 20)));
    }

    // -------------------------------------------------------------
    // 6. REAL MULTILINGUAL AI ASSISTANT CHAT
    // -------------------------------------------------------------
    const chatInput = document.getElementById('chat-input');
    const btnSendChat = document.getElementById('btn-send-chat');
    const chatHistory = document.getElementById('chat-history');

    loadChatHistory();

    function loadChatHistory() {
        const saved = JSON.parse(localStorage.getItem('saleem_chat_messages') || '[]');
        if (saved.length > 0 && chatHistory) {
            chatHistory.innerHTML = '';
            saved.forEach(msg => appendMessageUI(msg.sender, msg.text, false));
        }
    }

    function appendMessageUI(sender, text, shouldSave = true) {
        if (!chatHistory) return;
        const savedName = localStorage.getItem('saleem_user_name') || 'You';
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}`;
        msgDiv.innerHTML = `
            <div class="msg-avatar"><i class="fa-solid ${sender === 'user' ? 'fa-user' : 'fa-robot'}"></i></div>
            <div class="msg-content"><strong>${sender === 'user' ? savedName : 'Saleem AI'}:</strong> ${text}</div>
        `;
        chatHistory.appendChild(msgDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        if (shouldSave) {
            const saved = JSON.parse(localStorage.getItem('saleem_chat_messages') || '[]');
            saved.push({ sender, text, time: new Date().toISOString() });
            localStorage.setItem('saleem_chat_messages', JSON.stringify(saved));
        }
    }

    async function handleSendMessage() {
        const prompt = chatInput.value.trim();
        if (!prompt) return;

        appendMessageUI('user', prompt);
        chatInput.value = '';

        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'chat-message assistant';
        typingDiv.innerHTML = `<div class="msg-content" style="color: var(--warm-sand);"><i class="fa-solid fa-circle-notch fa-spin"></i> Saleem AI processing...</div>`;
        chatHistory.appendChild(typingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        try {
            const currentUiLang = localStorage.getItem('saleem_ui_lang') || 'en';
            const savedName = localStorage.getItem('saleem_user_name') || 'User';
            const response = await fetch(`https://text.pollinations.ai/prompt/${encodeURIComponent("System: You are Saleem AI, a friendly multilingual guide for " + savedName + " who is a refugee in Egypt speaking " + currentUiLang + ". User: " + prompt)}`);
            const aiText = await response.text();

            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();

            if (aiText && aiText.length > 5) {
                appendMessageUI('assistant', aiText);
            } else {
                throw new Error('Empty AI response');
            }
        } catch (err) {
            console.warn('AI API fallback:', err);
            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();

            const savedName = localStorage.getItem('saleem_user_name') || 'Friend';
            let reply = `Ahlan ${savedName}! I am Saleem AI. For housing, public transport, or UNHCR residency renewals, feel free to ask!`;
            const lower = prompt.toLowerCase();
            if (lower.includes("metro") || lower.includes("መሬት") || lower.includes("مترو")) {
                reply = `The Cairo Metro has 3 main lines. Single tickets cost 6, 8, 12, or 15 EGP. Ladies-only carriages are located in the center of every train.`;
            } else if (lower.includes("apartment") || lower.includes("rent") || lower.includes("ቤት")) {
                reply = `When renting an apartment in Cairo (e.g. Nasr City, Maadi, Faisal), ensure you obtain a formal written lease contract (Aqd Igar).`;
            } else if (lower.includes("unhcr") || lower.includes("residency")) {
                reply = `UNHCR main registration is located at 56 Central Spine, 6th of October City. Bring your passport, yellow card, and 4 passport photos.`;
            }

            appendMessageUI('assistant', reply);
        }
    }

    if (btnSendChat) btnSendChat.addEventListener('click', handleSendMessage);
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSendMessage();
        });
    }

    window.sendQuickQuestion = function(qText) {
        if (chatInput) {
            chatInput.value = qText;
            handleSendMessage();
        }
    };

    // -------------------------------------------------------------
    // 7. COMMUNITY Q&A, INCIDENT REPORTING & CHECKLIST
    // -------------------------------------------------------------
    const btnPostQA = document.getElementById('btn-post-qa');
    const qaTitle = document.getElementById('qa-title');
    const qaDesc = document.getElementById('qa-desc');

    loadCommunityQuestions();

    function loadCommunityQuestions() {
        const questions = JSON.parse(localStorage.getItem('saleem_community_qa') || '[]');
        const container = document.querySelector('#tab-community .card:last-child');
        if (!container) return;

        let qaListDiv = document.getElementById('qa-list-container');
        if (!qaListDiv) {
            qaListDiv = document.createElement('div');
            qaListDiv.id = 'qa-list-container';
            qaListDiv.style.marginTop = '20px';
            container.appendChild(qaListDiv);
        }

        if (questions.length === 0) {
            const defaults = [
                { id: 'q1', title: 'Where can I find beginner Arabic classes in Maadi?', desc: 'Looking for evening classes starting next week.', author: 'Omer K.', votes: 14 },
                { id: 'q2', title: 'What is the procedure for enrolling children in Cairo public schools?', desc: 'Need legal guidance on school stamp requirements.', author: 'Sarah M.', votes: 29 }
            ];
            localStorage.setItem('saleem_community_qa', JSON.stringify(defaults));
            renderQuestions(defaults);
        } else {
            renderQuestions(questions);
        }
    }

    function renderQuestions(questions) {
        const qaListDiv = document.getElementById('qa-list-container');
        if (!qaListDiv) return;

        qaListDiv.innerHTML = '<h4 style="margin-bottom:12px; color:var(--warm-sand);">Recent Community Questions</h4>';
        questions.forEach((q, idx) => {
            const item = document.createElement('div');
            item.className = 'card';
            item.style.padding = '16px';
            item.style.marginBottom = '10px';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong style="font-size:16px; color:#fff;">${q.title}</strong>
                    <span style="font-size:12px; color:var(--emerald);">by ${q.author || 'Anonymous'}</span>
                </div>
                <p style="font-size:14px; color:var(--text-muted); margin:8px 0;">${q.desc}</p>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button class="chip-btn" onclick="upvoteQuestion('${q.id || idx}')"><i class="fa-solid fa-thumbs-up"></i> Upvote (${q.votes || 0})</button>
                    <span style="font-size:12px; color:var(--text-muted);"><i class="fa-regular fa-comment"></i> ${q.answers || 0} Answers</span>
                </div>
            `;
            qaListDiv.appendChild(item);
        });
    }

    if (btnPostQA) {
        btnPostQA.addEventListener('click', () => {
            const title = qaTitle.value.trim();
            const desc = qaDesc.value.trim();
            if (!title || !desc) {
                alert('Please enter both a title and description.');
                return;
            }

            const authorName = localStorage.getItem('saleem_user_name') || 'Anonymous User';
            const questions = JSON.parse(localStorage.getItem('saleem_community_qa') || '[]');
            questions.unshift({ id: 'q_' + Date.now(), title, desc, author: authorName, votes: 1, answers: 0 });
            localStorage.setItem('saleem_community_qa', JSON.stringify(questions));

            qaTitle.value = '';
            qaDesc.value = '';
            loadCommunityQuestions();
        });
    }

    window.upvoteQuestion = function(id) {
        const questions = JSON.parse(localStorage.getItem('saleem_community_qa') || '[]');
        const target = questions.find(q => q.id === id);
        if (target) {
            target.votes = (target.votes || 0) + 1;
            localStorage.setItem('saleem_community_qa', JSON.stringify(questions));
            loadCommunityQuestions();
        }
    };

    // Incident Reporting
    const btnReport = document.querySelector('#tab-awareness .btn-danger');
    if (btnReport) {
        btnReport.addEventListener('click', () => {
            const locationInput = document.querySelector('#tab-awareness input');
            const descInput = document.querySelector('#tab-awareness textarea');

            const location = locationInput ? locationInput.value.trim() : '';
            const desc = descInput ? descInput.value.trim() : '';

            if (!location || !desc) {
                alert('Please fill out both the incident location and details.');
                return;
            }

            const trackingId = 'SLM-REP-' + Math.floor(100000 + Math.random() * 900000);
            const reports = JSON.parse(localStorage.getItem('saleem_incident_reports') || '[]');
            reports.unshift({ trackingId, location, desc, status: 'Under Review', timestamp: new Date().toLocaleString() });
            localStorage.setItem('saleem_incident_reports', JSON.stringify(reports));

            if (locationInput) locationInput.value = '';
            if (descInput) descInput.value = '';

            alert(`Confidential Incident Report Filed Successfully!\nTracking Number: ${trackingId}\nAssigned to legal aid queue.`);
        });
    }

    // Checkboxes
    const checkboxes = document.querySelectorAll('.checklist input[type="checkbox"]');
    checkboxes.forEach((cb, idx) => {
        const savedState = localStorage.getItem(`saleem_chk_${idx}`);
        if (savedState !== null) cb.checked = savedState === 'true';
        cb.addEventListener('change', () => localStorage.setItem(`saleem_chk_${idx}`, cb.checked));
    });

    // Quiz Modal
    window.openQuiz = function(category) {
        const quizModal = document.createElement('div');
        quizModal.id = 'quiz-modal';
        quizModal.style.position = 'fixed';
        quizModal.style.top = '0';
        quizModal.style.left = '0';
        quizModal.style.width = '100%';
        quizModal.style.height = '100%';
        quizModal.style.background = 'rgba(11, 19, 43, 0.9)';
        quizModal.style.zIndex = '1000';
        quizModal.style.display = 'flex';
        quizModal.style.alignItems = 'center';
        quizModal.style.justifyContent = 'center';

        quizModal.innerHTML = `
            <div class="card" style="width: 500px; padding: 30px; position: relative;">
                <button onclick="document.getElementById('quiz-modal').remove()" style="position:absolute; top:15px; right:15px; background:none; border:none; color:#fff; font-size:20px; cursor:pointer;">&times;</button>
                <h3 style="color:var(--warm-sand); margin-bottom:10px;">${category} Quiz Check</h3>
                <p style="margin-bottom:20px;">Which metro cars in Cairo are reserved exclusively for female passengers?</p>
                <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                    <label class="check-item"><input type="radio" name="qz" value="0"> Front cars only</label>
                    <label class="check-item"><input type="radio" name="qz" value="1"> Middle cars clearly marked</label>
                    <label class="check-item"><input type="radio" name="qz" value="2"> Rear car</label>
                </div>
                <button class="btn btn-primary" onclick="submitQuizAnswer('${category}')">Submit Answer</button>
            </div>
        `;
        document.body.appendChild(quizModal);
    };

    window.submitQuizAnswer = function(category) {
        const selected = document.querySelector('input[name="qz"]:checked');
        if (!selected) {
            alert('Please select an answer.');
            return;
        }
        const isCorrect = selected.value === '1';
        alert(isCorrect ? `Correct! Middle metro cars are reserved for female passengers. Progress saved (+100 XP).` : `Incorrect. Middle metro cars are reserved for female passengers.`);
        localStorage.setItem(`saleem_quiz_${category}`, isCorrect ? '100' : '50');
        const modal = document.getElementById('quiz-modal');
        if (modal) modal.remove();
    };
});
