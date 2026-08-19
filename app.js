document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // SALEEM PRODUCTION API CLIENT
    // -------------------------------------------------------------
    const API = {
        baseUrl: '/api',
        getToken() {
            return localStorage.getItem('saleem_token');
        },
        setToken(token) {
            if (token) localStorage.setItem('saleem_token', token);
            else localStorage.removeItem('saleem_token');
        },
        headers(isJson = true) {
            const h = {};
            if (isJson) h['Content-Type'] = 'application/json';
            const token = this.getToken();
            if (token) h['Authorization'] = `Bearer ${token}`;
            return h;
        },
        async fetch(url, options = {}) {
            const isJson = options.body !== undefined && !(options.body instanceof FormData);
            options.headers = { ...this.headers(isJson), ...options.headers };
            try {
                const res = await fetch(`${this.baseUrl}${url}`, options);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                return data;
            } catch (e) {
                console.warn(`API request failed [${url}]:`, e);
                throw e;
            }
        }
    };
    window.SaleemAPI = API;

    // -------------------------------------------------------------
    // SUPABASE ANONYMOUS AUTH CLIENT (PERSISTENT SINGLETON)
    // -------------------------------------------------------------
    const SUPABASE_AUTH_STORAGE_KEY = 'saleem_supabase_auth_session';
    let _supabaseClient = window._saleemSupabaseClient || null;
    let _supabaseInitPromise = null;

    async function getSupabaseClient() {
        if (_supabaseClient) return _supabaseClient;
        if (window._saleemSupabaseClient) {
            _supabaseClient = window._saleemSupabaseClient;
            return _supabaseClient;
        }
        if (_supabaseInitPromise) return _supabaseInitPromise;
        _supabaseInitPromise = (async () => {
            try {
                if (!window.supabase?.createClient) {
                    console.warn('Supabase SDK not loaded, anonymous auth unavailable');
                    return null;
                }
                const cfgRes = await fetch('/api/config/public');
                const config = await cfgRes.json();
                if (config.supabase_url && config.supabase_anon_key) {
                    // Explicitly configure session persistence, auto-refresh and storage key
                    _supabaseClient = window.supabase.createClient(config.supabase_url, config.supabase_anon_key, {
                        auth: {
                            persistSession: true,
                            autoRefreshToken: true,
                            detectSessionInUrl: true,
                            storage: window.localStorage,
                            storageKey: SUPABASE_AUTH_STORAGE_KEY
                        }
                    });
                    window._saleemSupabaseClient = _supabaseClient;
                    console.log('Supabase client initialized with persistent auth storage:', SUPABASE_AUTH_STORAGE_KEY);
                    return _supabaseClient;
                }
                console.warn('Supabase not configured on server, using local-only mode');
                return null;
            } catch (e) {
                console.warn('Failed to initialize Supabase client:', e.message);
                return null;
            }
        })();
        return _supabaseInitPromise;
    }

    let _authPromise = null;

    /**
     * Centralized singleton for Supabase Anonymous Authentication.
     * - Guarantees session persistence across reloads (reuses exact same auth.user.id).
     * - Checks active session, user state, and stored session token BEFORE calling signInAnonymously().
     * - Calls signInAnonymously() ONLY when definitively unauthenticated.
     * - In-flight promise locking prevents concurrent sign-ins.
     */
    async function ensureAuthenticatedUser() {
        if (_authPromise) return _authPromise;
        _authPromise = (async () => {
            const existingStoredUid = localStorage.getItem('saleem_supabase_uid');
            const sb = await getSupabaseClient();
            if (sb) {
                try {
                    // Step 1: Check existing restored session
                    const { data: sessionData } = await sb.auth.getSession();
                    if (sessionData?.session?.user?.id) {
                        const uid = sessionData.session.user.id;
                        localStorage.setItem('saleem_supabase_uid', uid);
                        return { uid, source: 'supabase' };
                    }

                    // Step 2: Check current user state
                    const { data: userData } = await sb.auth.getUser().catch(() => ({ data: {} }));
                    if (userData?.user?.id) {
                        const uid = userData.user.id;
                        localStorage.setItem('saleem_supabase_uid', uid);
                        return { uid, source: 'supabase' };
                    }

                    // Step 3: Check stored session object in localStorage for refresh
                    const storedRaw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
                    if (storedRaw) {
                        try {
                            const parsed = JSON.parse(storedRaw);
                            if (parsed?.refresh_token) {
                                const { data: refreshed } = await sb.auth.refreshSession({ refresh_token: parsed.refresh_token }).catch(() => ({ data: {} }));
                                if (refreshed?.session?.user?.id) {
                                    const uid = refreshed.session.user.id;
                                    localStorage.setItem('saleem_supabase_uid', uid);
                                    return { uid, source: 'supabase' };
                                }
                            }
                            if (parsed?.user?.id) {
                                const uid = parsed.user.id;
                                localStorage.setItem('saleem_supabase_uid', uid);
                                return { uid, source: 'supabase' };
                            }
                        } catch (parseErr) {
                            console.warn('Session parsing fallback:', parseErr?.message);
                        }
                    }

                    // Step 4: ONLY call signInAnonymously() when NO session exists anywhere
                    console.log('No existing Supabase session found. Performing initial anonymous sign-in...');
                    const { data, error } = await sb.auth.signInAnonymously();
                    if (error) throw error;
                    if (!data?.user?.id) throw new Error('Supabase anonymous sign-in returned empty user.');

                    const uid = data.user.id;
                    localStorage.setItem('saleem_supabase_uid', uid);
                    console.log('Supabase anonymous auth registered (UID will persist):', uid);
                    return { uid, source: 'supabase' };
                } catch (e) {
                    console.warn('Supabase auth session resolution notice:', e.message);
                }
            }

            // Fallback for offline or unconfigured environment
            if (existingStoredUid) return { uid: existingStoredUid, source: 'supabase' };
            let legacyId = localStorage.getItem('saleem_user_id');
            if (!legacyId) {
                legacyId = 'SLM-' + Math.floor(100000 + Math.random() * 900000);
                localStorage.setItem('saleem_user_id', legacyId);
            }
            return { uid: legacyId, source: 'local' };
        })();

        // Keep promise cached on success; clear only on failure so subsequent calls can retry
        _authPromise.catch(() => { _authPromise = null; });
        return _authPromise;
    }


    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatTrustedText(value) {
        return escapeHtml(value).replace(/\n/g, '<br>');
    }

    function getOrCreateLocalSecret() {
        let secret = localStorage.getItem('saleem_local_secret');
        if (!secret) {
            const bytes = new Uint8Array(24);
            window.crypto?.getRandomValues?.(bytes);
            secret = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') || `${Date.now()}-${Math.random()}`;
            localStorage.setItem('saleem_local_secret', secret);
        }
        return secret;
    }

    // -------------------------------------------------------------
    // 0. SERVER-SIDE PROXIED AI VOICE SYNTHESIS ENGINE (speakText)
    // -------------------------------------------------------------
    let currentAudio = null;

    window.speakText = async function(text, lang) {
        if (!text || text.trim().length === 0) return;

        // Strip HTML tags and parenthetical text if any
        const cleanText = text.replace(/<[^>]*>?/gm, '').replace(/\([^\)]*\)/g, '').trim();

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        try {
            const response = await fetch('/api/tts/speak', {
                method: 'POST',
                headers: API.headers(true),
                body: JSON.stringify({ text: cleanText })
            });

            if (response.ok && response.headers.get('content-type')?.includes('audio')) {
                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                currentAudio = new Audio(audioUrl);
                currentAudio.play();
                currentAudio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    currentAudio = null;
                };
                return;
            }
        } catch (e) {
            console.warn('Backend TTS failed, falling back to Web Speech API:', e);
        }

        // Web Speech Fallback optimized for Egyptian Arabic (ar-EG)
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = lang || 'ar-EG';
            utterance.rate = 0.85; // Natural spoken speed for Egyptian dialect
            utterance.pitch = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const arEgVoice = voices.find(v => v.lang && (v.lang.toLowerCase() === 'ar-eg' || v.lang.toLowerCase().startsWith('ar')));
            if (arEgVoice) utterance.voice = arEgVoice;
            window.speechSynthesis.speak(utterance);
        }
    };

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
    // 2. COMPREHENSIVE MULTILINGUAL DICTIONARY (ALL WORDS TRANSLATED)
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
            "search-ph": "Search resources, services, guides & dialect terms...",
            "hdr-translator-title": "African & Egyptian Dialect Translator",
            "hdr-translator-sub": "Translate spoken or written text into Egyptian Colloquial Arabic, Amharic, Somali, Tigrinya, Swahili, Hausa, Oromo, French & English with dialect guidance.",
            "hdr-assistant-title": "Multilingual AI Integration Assistant",
            "hdr-assistant-sub": "Ask questions in any African language on housing, public transit, legal rights, and everyday Egyptian life.",
            "hdr-culture-title": "Interactive Culture & Etiquette Guide",
            "hdr-culture-sub": "Master local customs, transportation etiquettes, and market negotiation rules.",
            "hdr-legal-title": "Legal Support & Refugee Rights",
            "hdr-legal-sub": "Access documented legal rights, UNHCR procedures, checklists & document tools.",
            "hdr-services-title": "Essential Services Directory",
            "hdr-services-sub": "Locate nearby healthcare clinics, language schools, legal aid centers & NGO offices.",
            "hdr-community-title": "Community Hub & Volunteer Mentors",
            "hdr-community-sub": "Ask peer questions, find verified volunteers speaking your language, and attend cultural meetups.",
            "hdr-learning-title": "Learning Hub - Programming & Digital Skills",
            "hdr-learning-sub": "Free programming education, career paths, and remote job board.",
            "hdr-awareness-title": "Awareness Campaigns & Incident Reporting",
            "hdr-awareness-sub": "Confidential discrimination reporting and inclusion campaigns.",
            "hdr-profile-title": "User Profile & Settings",
            "hdr-profile-sub": "Manage security preferences, biometric login, and preferred language.",
            "btn-translate-now": "Translate Now",
            "btn-voice-input": "Voice Input",
            "btn-hotlines": "Hotlines",
            "btn-get-apk": "Get APK",
            "hero-title": "Feel at home, one phrase at a time.",
            "hero-sub": "Saleem helps refugees and displaced people in Egypt learn the local dialect, understand everyday culture, and reach essential services with dignity."
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
            "search-ph": "ابحث عن الخدمات والدلائل والمصطلحات...",
            "hdr-translator-title": "مترجم اللهجة المصرية والأفريقية",
            "hdr-translator-sub": "ترجم النصوص والأصوات إلى العامية المصرية والأمهرية والصومالية والتيغرينية والسواحلية والهوسا والفرنسية والإنجلترا.",
            "hdr-assistant-title": "المساعد المباشر للذكاء الاصطناعي",
            "hdr-assistant-sub": "اطرح الأسئلة بأي لغة أفريقية حول السكن والمواصلات والحقوق القانونية والحياة في مصر.",
            "hdr-culture-title": "دليل العادات والتقاليد التفاعلي",
            "hdr-culture-sub": "تعلم العادات المحلية وقواعد المواصلات والتسوق والتفاوض.",
            "hdr-legal-title": "الدعم القانوني وحقوق اللاجئين",
            "hdr-legal-sub": "الوصول إلى الحقوق القانونية وإجراءات مفوضية اللاجئين وقوائم التحقق.",
            "hdr-services-title": "دليل الخدمات الأساسية",
            "hdr-services-sub": "تحديد مواقع العيادات الطبية ومدارس اللغات والمراكز القانونية والمنظمات.",
            "hdr-community-title": "ملتقى المجتمع والمتطوعين",
            "hdr-community-sub": "اطرح الأسئلة وتواصل مع متطوعين يتحدثون لغتك واحتضر اللقاءات.",
            "hdr-learning-title": "مركز التعلم والمهارات الرقمية",
            "hdr-learning-sub": "تعليم برمجة مجاني ومسارات مهنية وفرص عمل عن بُعد.",
            "hdr-awareness-title": "حملات التوعية والإبلاغ",
            "hdr-awareness-sub": "الإبلاغ السري عن حالات التمييز وحملات الإدماج المجتمعي.",
            "hdr-profile-title": "الملف الشخصي والإعدادات",
            "hdr-profile-sub": "إدارة الأمان والدخول البصمي واللغة المفضلة.",
            "btn-translate-now": "ترجم الآن",
            "btn-voice-input": "إدخال صوتي",
            "btn-hotlines": "الخطوط الساخنة",
            "btn-get-apk": "تحميل التطبيق",
            "hero-title": "تمكين كل لاجئ لبناء حياة آمنة ومستقلة",
            "hero-sub": "سليم يزيل حواجز اللغة من خلال الترجمة الفورية للعامية المصرية، والدليل القانوني، ودليل الخدمات، والتعليم المجاني."
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
            "search-ph": "አገልግሎቶችን እና መመሪያዎችን ፈልግ...",
            "hdr-translator-title": "የግብፅ እና የአፍሪካ ቋንቋዎች ተርጓሚ",
            "hdr-translator-sub": "ጽሑፍን ወይም ድምጽን ወደ ግብፅ ዓረብኛ፣ አማርኛ፣ ሶማሊኛ፣ ትግርኛ፣ ስዋሂሊ እና ፈረንሳይኛ ይተርጉሙ።",
            "hdr-assistant-title": "ባለብዙ ቋንቋ ኤአይ ረዳት",
            "hdr-assistant-sub": "ስለ መኖሪያ ቤት፣ ትራንስፖርት እና ህጋዊ መብቶች በማንኛውም አፍሪካዊ ቋንቋ ይጠይቁ።",
            "hdr-culture-title": "የባህል እና የስነ-ምግባር መመሪያ",
            "hdr-culture-sub": "የአካባቢ ባህሎችን፣ የትራንስፖርት ህጎችን እና የገበያ ግብይቶችን ይማሩ።",
            "hdr-legal-title": "ሕጋዊ ድጋፍ እና የስደተኞች መብት",
            "hdr-legal-sub": "የህግ መብቶችን፣ የUNHCR አሰራሮችን እና የአደጋ ጊዜ ስልኮችን ያግኙ።",
            "hdr-services-title": "አስፈላጊ የአገልግሎቶች ማውጫ",
            "hdr-services-sub": "አቅራቢያ ያሉ የጤና ክሊኒኮችን፣ የቋንቋ ትምህርት ቤቶችን እና NGOዎችን ያግኙ።",
            "hdr-community-title": "የማህበረሰብ ማዕከል",
            "hdr-community-sub": "ጥያቄዎችን ይጠይቁ እና ቋንቋዎን ከሚናገሩ ፈቃደኞች ጋር ይገናኙ።",
            "hdr-learning-title": "የትምህርት ማዕከል - የዲጂታል ክህሎቶች",
            "hdr-learning-sub": "ነፃ የፕሮግራሚንግ ትምህርት እና የርቀት ስራ እድሎች።",
            "hdr-awareness-title": "የግንዛቤ ዘመቻዎች",
            "hdr-awareness-sub": "ሚስጥራዊ የልዩነት ሪፖርት ማቅረቢያ።",
            "hdr-profile-title": "መገለጫ እና ቅንብሮች",
            "hdr-profile-sub": "የደህንነት ምርጫዎችን እና ቋንቋን ያስተዳድሩ።",
            "btn-translate-now": "አሁን ተርጉም",
            "btn-voice-input": "በድምፅ አስገባ",
            "btn-hotlines": "የአደጋ ጊዜ ስልኮች",
            "btn-get-apk": "ኤፒኬ አውርድ",
            "hero-title": "እያንዳንዱ ስደተኛ ደህንነቱ የተጠበቀ ህይወት እንዲገነባ መደገፍ",
            "hero-sub": "ሰሊም በቋንቋ ትርጉም፣ በህጋዊ መመሪያ እና በነጻ ትምህርት የቋንቋ እንቅፋቶችን ያቃልላል።"
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
            "search-ph": "Raadso adeegyada iyo hagayaasha...",
            "hdr-translator-title": "Turjumaanka Luqadaha Afrika & Masar",
            "hdr-translator-sub": "U beddel qoraalka ama codka Af-Carabiga Masar, Af-Somali, Amharic, Tigrinya, Swahili iyo Fransays.",
            "hdr-assistant-title": "Kaaliyaha Caqliga Artificial (AI)",
            "hdr-assistant-sub": "Weydiiso su'aalo ku saabsan guryaha, gaadiidka iyo sharciga masar luqad kasta.",
            "hdr-culture-title": "Hagaha Dhaqanka & Anshaxa Masar",
            "hdr-culture-sub": "Baro dhaqanka maxalliga ah, gaadiidka iyo gorgortanka suuqyada.",
            "hdr-legal-title": "Taeageerada Sharciga & Xuquuqda Qaxootiga",
            "hdr-legal-sub": "Ka hel xuquuqda sharciga, nidaamka UNHCR iyo lambarada degdega ah.",
            "hdr-services-title": "Hagaha Adeegyada Muhiimka Ah",
            "hdr-services-sub": "Eeg rugaha caafimaadka, iskuulada luqadaha iyo xafiisyada NGO-yada.",
            "hdr-community-title": "Xarunta Bulshada & Mutadawiciinta",
            "hdr-community-sub": "Weydii su'aalo, ka hel mutadawiciin ku hadla luqadaada.",
            "hdr-learning-title": "Xarunta Waxbarashada & Xirfadaha Digitaalka",
            "hdr-learning-sub": "Waxbarasho barnaamijyada bilaashka ah iyo fursadaha shaqada.",
            "hdr-awareness-title": "Ololaha Wacyigelinta",
            "hdr-awareness-sub": "Warbixinta rabshadaha ama takoorida si qarsoodi ah.",
            "hdr-profile-title": "Profaylka & Dejinta",
            "hdr-profile-sub": "Maaree amniga iyo luqadda aad doorbideyso.",
            "btn-translate-now": "Turjum Hadda",
            "btn-voice-input": "Geli Cod",
            "btn-hotlines": "Lambarada Degdega",
            "btn-get-apk": "Dharji APK",
            "hero-title": "Awood siinta Qaxooti kasta si uu u dhitaysado Noolal Amni ah",
            "hero-sub": "Saleem wuxuu baab'iyaa caqabadaha luqadda si toos ah iyo taageero sharciga."
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
            "search-ph": "Rechercher des services, guides et termes...",
            "hdr-translator-title": "Traducteur de Dialectes Égyptiens et Africains",
            "hdr-translator-sub": "Traduisez du texte ou de la voix en arabe égyptien, amharique, somali, tigrinya, swahili, haoussa et français.",
            "hdr-assistant-title": "Assistant d'Intégration Multilingue IA",
            "hdr-assistant-sub": "Posez des questions sur le logement, les transports et les droits légaux dans n'importe quelle langue africaine.",
            "hdr-culture-title": "Guide Culturel et d'Étiquette Interactif",
            "hdr-culture-sub": "Maîtrisez les coutumes locales, les règles de transport et les négociations sur les marchés.",
            "hdr-legal-title": "Soutien Juridique et Droits des Réfugiés",
            "hdr-legal-sub": "Accédez aux droits légaux documentés, procédures HCR et numéros d'urgence.",
            "hdr-services-title": "Annuaire des Services Essentiels",
            "hdr-services-sub": "Localisez les cliniques, écoles de langues, centres d'aide juridique et ONG.",
            "hdr-community-title": "Centre Communautaire et Bénévoles",
            "hdr-community-sub": "Posez des questions et échangez avec des bénévoles parlant votre langue.",
            "hdr-learning-title": "Centre d'Apprentissage - Compétences Numériques",
            "hdr-learning-sub": "Formation gratuite en programmation et opportunités d'emploi à distance.",
            "hdr-awareness-title": "Campagnes de Sensibilisation",
            "hdr-awareness-sub": "Signalement confidentiel des discriminations.",
            "hdr-profile-title": "Profil d'Utilisateur et Paramètres",
            "hdr-profile-sub": "Gérez la sécurité, la biométrie et la langue préférée.",
            "btn-translate-now": "Traduire Maintenant",
            "btn-voice-input": "Saisie Vocale",
            "btn-hotlines": "Lignes d'Urgence",
            "btn-get-apk": "Télécharger APK",
            "hero-title": "Autonomiser Chaque Réfugié pour Construire une Vie Sûre",
            "hero-sub": "Saleem élimine les barrières linguistiques grâce à la traduction en temps réel et au soutien juridique."
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
            "search-ph": "ኣገልግሎታትን መምርሒታትን ድለይ...",
            "hdr-translator-title": "ተተርጋሚ ቋንቋታት ግብፅን ኣፍሪቃን",
            "hdr-translator-sub": "ፅሑፍ ወይ ድምፂ ናብ ዓረብኛ ግብፂ፣ ትግርኛ፣ ኣምሓርኛ፣ ሶማሊኛን ስዋሂሊን ተርጉም፤፤",
            "hdr-assistant-title": "ብዝሐ ቋንቋ ኤአይ ሓጋዚ",
            "hdr-assistant-sub": "ብዛዕባ ኣባይቲ፣ መጓዓዝያን ሕጋዊ መሰላትን ብዝኾነ ቋንቋ ሕተት፤፤",
            "hdr-culture-title": "ባህላዊ መምርሒን ስነ-ምግባርን",
            "hdr-culture-sub": "ባህሊ፣ ሕግታት መጓዓዝያን ዕዳጋን ተማሃር፤፤",
            "hdr-legal-title": "ሕጋዊ ደጋፍን መሰል ተፈናቐልትን",
            "hdr-legal-sub": "ሕጋዊ መሰላት፣ መስርሕ UNHCRን ቁፅሪ ሓደጋን ረክብ፤፤",
            "hdr-services-title": "ማውጫ ኣገደስቲ ኣገልግሎታት",
            "hdr-services-sub": "ክሊኒካት፣ ኣብያተ ትምህርቲ ቋንቋን NGOታትን ድለይ፤፤",
            "hdr-community-title": "ማእከል ማሕበረሰብ",
            "hdr-community-sub": "ሕቶታት ሕተት፣ ቋንቋኻ ምስ ዝዛረቡ ሓገዝቲ ተራኸብ፤፤",
            "hdr-learning-title": "ማእከል ትምህርቲ - ዲጂታል ክእለት",
            "hdr-learning-sub": "ነፃ ትምህርቲ ፕሮግራሚንግን ዕድል ስራሕን፤፤",
            "hdr-awareness-title": "ወፈራ ግንዛቤ",
            "hdr-awareness-sub": "ምስጢራዊ ሪፖርት ፈላሊኻ ምእላይ፤፤",
            "hdr-profile-title": "ፕሮፋይልን መደባትን",
            "hdr-profile-sub": "ምርጫ ደህንነትን ቋንቋን ኣመሓድር፤፤",
            "btn-translate-now": "ሕዚ ተርጉም",
            "btn-voice-input": "ብድምፂ ኣእቱ",
            "btn-hotlines": "ቁፅሪ ሓደጋ",
            "btn-get-apk": "ኤፒኬ ኣውርድ",
            "hero-title": "ነፍሲ ወከፍ ተፈናቓሊ ውሑስ ህይወት ክሃንፅ ምድጋፍ",
            "hero-sub": "ሰሊም ብትርጉም ቋንቋን ሕጋዊ መምርሒን ፀገማት ቋንቋ የቃልል፤፤"
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
            "search-ph": "Tafuta huduma na miongozo...",
            "hdr-translator-title": "Mtafsiri wa Lugha za Afrika na Misri",
            "hdr-translator-sub": "Tafsiri maandishi au sauti kwa Kiarabu cha Misri, Kiswahili, Amharic, Somali, Tigrinya na Kifaransa.",
            "hdr-assistant-title": "Msaidizi wa AI wa Lugha Nyingi",
            "hdr-assistant-sub": "Uliza maswali kuhusu nyumba, usafiri na haki za kisheria kwa lugha yoyote ya Kiafrika.",
            "hdr-culture-title": "Mwongozo wa Utamaduni na Maadili",
            "hdr-culture-sub": "Jifunze mila za mtaani, sheria za usafiri na mazungumzo ya masoko.",
            "hdr-legal-title": "Msaada wa Kisheria na Haki za Wakimbizi",
            "hdr-legal-sub": "Pata haki za kisheria, taratibu za UNHCR na nambari za dharura.",
            "hdr-services-title": "Orodha ya Huduma Muhimu",
            "hdr-services-sub": "Tafuta kliniki za afya, shule za lugha na mashirika ya NGO.",
            "hdr-community-title": "Kituo cha Jamii na Wajitolea",
            "hdr-community-sub": "Uliza maswali na ungana na wajitolea wanaozungumza lugha yako.",
            "hdr-learning-title": "Kituo cha Masomo - Ujuzi wa Kidijitali",
            "hdr-learning-sub": "Elimu ya bure ya kozi za kompyuta na fursa za kazi.",
            "hdr-awareness-title": "Harakati za Uhamasisho",
            "hdr-awareness-sub": "Ripoti ya siri ya ubaguzi au matukio.",
            "hdr-profile-title": "Wasifu na Mipangilio",
            "hdr-profile-sub": "Weka mipangilio ya usalama na lugha uipendayo.",
            "btn-translate-now": "Tafsiri Sasa",
            "btn-voice-input": "Weka Sauti",
            "btn-hotlines": "Nambari za Dharura",
            "btn-get-apk": "Pakua APK",
            "hero-title": "Kuwezesha Kila Mkimbizi Kujenga Maisha Salama",
            "hero-sub": "Saleem huondoa vikwazo vya lugha kwa tafsiri ya papo hapo na mwongozo wa kisheria."
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
            "search-ph": "Bincika ayyuka da jagorori...",
            "hdr-translator-title": "Mai Fassara Harsunan Afrika da Masar",
            "hdr-translator-sub": "Fassara rubutu ko magana zuwa Larabcin Masar, Hausa, Amharic, Somali, Swahili da Faransanci.",
            "hdr-assistant-title": "Mataimakin AI na Harsuna Daban-daban",
            "hdr-assistant-sub": "Tambayi tambayoyi game da gidaje, sufuri da haƙƙoƙin shari'a a duk harshen Afrika.",
            "hdr-culture-title": "Jagoran Al'ada da Halaye",
            "hdr-culture-sub": "Koyi al'adun gida, dokokin sufuri da hanyoyin ciniki a kasuwa.",
            "hdr-legal-title": "Taimakon Shari'a da Haƙƙoƙin 'Yan Gudun Hijira",
            "hdr-legal-sub": "Samu haƙƙoƙin shari'a, hanyoyin UNHCR da lambobin gaggawa.",
            "hdr-services-title": "Darakta na Ayyuka Masu Muhimmanci",
            "hdr-services-sub": "Nemi asibitoci, makarantun harshe da cibiyoyin kungiyoyi masu zaman kansu.",
            "hdr-community-title": "Cibiyar Al'umma da Masu Sa-kai",
            "hdr-community-sub": "Yi tambayoyi kuma sadu da masu sa-kai da ke jin harshenku.",
            "hdr-learning-title": "Cibiyar Koyo - Kayan Aikin Digital",
            "hdr-learning-sub": "Koyon kwas din kwamfuta kyauta da damar aiki daga nesa.",
            "hdr-awareness-title": "Yaƙin Fakar da Jama'a",
            "hdr-awareness-sub": "Bada rahoton tsangwama ko wariya a sirri.",
            "hdr-profile-title": "Bayanai & Saituna",
            "hdr-profile-sub": "Sarrafa tsaro da zaɓaɓɓen harshe.",
            "btn-translate-now": "Fassara Yanzu",
            "btn-voice-input": "Shigar da Murya",
            "btn-hotlines": "Lambobin Gaggawa",
            "btn-get-apk": "Zazzage APK",
            "hero-title": "Pusawa kowane Ɗan Gudun Hijira Iko don Gina Rayuwa Mai Tsaro",
            "hero-sub": "Saleem yana cire shingen harshe ta hanyar fassara nan take da jagorancin shari'a."
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
            "search-ph": "Tajaajilaafi qajeelfama barbaadi...",
            "hdr-translator-title": "Hiikaa Afaanota Afrikaafi Gibxi",
            "hdr-translator-sub": "Barreeffama ykn sagalee gara Afaan Arabiffaa Gibxi, Afaan Oromoo, Amaariffaa, Somaaliffaa fi Firaansiffaatti hiiki.",
            "hdr-assistant-title": "Gargaaraa AI Afaanota Baay'ee",
            "hdr-assistant-sub": "Gaaffilee mana jireenyaa, geejjibaa fi mirga seeraa afaan Afrikaa kaminiuu gaafadhu.",
            "hdr-culture-title": "Qajeelfama Aadaa fi Naamusa",
            "hdr-culture-sub": "Aadaa naannoo, seera geejjibaafi daldala gabaa baradhu.",
            "hdr-legal-title": "Deeggarsa Seeraa fi Mirga Baqattootaa",
            "hdr-legal-sub": "Mirga seeraa, adeemsa UNHCR fi lakkoofsota ariifachiisaa argadhu.",
            "hdr-services-title": "Tarree Tajaajiloota Murteessoo",
            "hdr-services-sub": "Kiliiniikota fayyaa, manneen barnoota afaaniifi dhaabbilee NGO barbaadi.",
            "hdr-community-title": "Wiirtuu Hawaasaa fi Arjoomtota",
            "hdr-community-sub": "Gaaffii gaafadhu, arjoomtota afaan kee dubbataniin wal-arguun walitti dhiyaadhu.",
            "hdr-learning-title": "Wiirtuu Barnootaa - Ogummaa Dijiitaalaa",
            "hdr-learning-sub": "Barnoota kompiyuutaraa tolaafi carraa hojii fageenyaa.",
            "hdr-awareness-title": "Duula Hubannoo Barnootaa",
            "hdr-awareness-sub": "Gabaasa loogii ykn waldhabdee iccitiin gabaasi.",
            "hdr-profile-title": "Pirofaayilii & Qindaa'ina",
            "hdr-profile-sub": "Filiannoo nageenyaafi afaan filatte bulchi.",
            "btn-translate-now": "Amma Hiiki",
            "btn-voice-input": "Sagalee Galchi",
            "btn-hotlines": "Lakkoofsa Ariifachiisaa",
            "btn-get-apk": "APK Buufadhu",
            "hero-title": "Baqataa Kamiyyuu Jireenya Nageenya Qabu Akka Ijaarratu Dandeessisuu",
            "hero-sub": "Saleem hiikaa afaaniifi deeggarsa seeraatiin gufuu afaanii balleessa."
        }
    };

    const LANGUAGE_METADATA = Object.freeze({
        en: { label: 'English', dir: 'ltr' },
        ar: { label: 'Egyptian Arabic', dir: 'rtl' },
        am: { label: 'Amharic', dir: 'ltr' },
        so: { label: 'Somali', dir: 'ltr' },
        fr: { label: 'French', dir: 'ltr' },
        ti: { label: 'Tigrinya', dir: 'ltr' },
        sw: { label: 'Swahili', dir: 'ltr' },
        ha: { label: 'Hausa', dir: 'ltr' },
        om: { label: 'Oromo', dir: 'ltr' }
    });

    const UI_I18N_ALIASES = Object.freeze({
        'nav-learn-translate': 'nav-learning',
        'nav-saleem-ai': 'nav-assistant',
        'nav-community-hub': 'nav-community',
        'nav-profile-dashboard': 'nav-profile'
    });

    // These messages are deliberately limited to language-contract states. They
    // are not substitutes for missing lesson or service translations.
    const LANGUAGE_RUNTIME_TEXT = Object.freeze({
        en: {
            coverageNotice: 'Some content is unavailable in the selected language. Egyptian Arabic content remains available where provided.',
            translationUnavailable: 'Translation unavailable in the selected language.',
            egyptianArabicOnly: 'Egyptian Arabic content only',
            languagePair: 'Language pair',
            startPractice: 'Start practice test',
            sectionLearn: 'Section A: Learn Egyptian & Culture Path',
            sectionLearnSub: 'Interactive Egyptian dialect path with situational practice and culture lessons.',
            dailyStreak: 'Daily Streak',
            totalXp: 'Total XP',
            jump: 'Jump',
            progress: 'Progress',
            sectionAi: 'Section B: Saleem AI (Egyptian Dialect AI Tutor)',
            sectionCommunity: 'Section C: Refugee Community Hub & Peer Forums',
            sectionProfile: 'Section D: Profile & Legal Institutions Access',
            brandSupport: 'Refugee Support',
            localProfile: 'Local Saleem profile',
            learningSnapshot: 'Personal Learning Snapshot',
            daysLabel: 'Days',
            lessonsLabel: 'Lessons',
            trackDialect: 'Track 1: Learn Egyptian Dialect',
            trackCulture: 'Track 2: Learn Egyptian Culture',
            datasetAvailable: 'Dataset available',
            datasetUnavailable: 'Dataset unavailable',
            loadingDataset: 'Loading learning dataset...',
            privateProgress: 'Private progress estimates from your activity on this device and synced account.',
            rank: 'Rank',
            learnerName: 'Learner Name',
            country: 'Country',
            xpPoints: 'XP Points',
            badge: 'Badge',
            noLessons: 'No lessons completed yet! Complete Lesson 1 to earn your first XP and rank on the Hall of Fame.',
            translatorPair: 'Translate between English and Egyptian Arabic.',
            assistantPair: 'Ask Saleem AI in English or Egyptian Arabic.',
            serviceFindHelp: 'Find Help Near Me',
            serviceChooseArea: 'Choose Area Manually',
            serviceSearchArea: 'Search This Area',
            servicePermission: 'Saleem uses your location once to sort verified services nearby. It is not stored or tracked.',
            serviceLocationDenied: 'Location was not shared. Choose an area manually instead.',
            serviceGpsUnavailable: 'Location is unavailable. Choose an area manually instead.',
            serviceNoResults: 'No verified services match this area or category.',
            serviceGovernorate: 'Governorate',
            serviceCity: 'City or area',
            serviceSort: 'Sort',
            serviceNearest: 'Nearest',
            serviceBestMatch: 'Best match',
            serviceRecentlyVerified: 'Recently verified'
            ,brandSupport: 'Refugee Support'
            ,localProfile: 'Local Saleem profile'
            ,learningSnapshot: 'Personal Learning Snapshot'
        },
        ar: {
            coverageNotice: '\u0628\u0639\u0636 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629. \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0645\u0635\u0631\u064a \u0645\u062a\u0627\u062d \u062d\u064a\u062b\u0645\u0627 \u064a\u0648\u062c\u062f.',
            translationUnavailable: '\u0627\u0644\u062a\u0631\u062c\u0645\u0629 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
            egyptianArabicOnly: '\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0628\u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0641\u0642\u0637',
            languagePair: '\u0632\u0648\u062c \u0627\u0644\u0644\u063a\u0627\u062a',
            startPractice: '\u0627\u0628\u062f\u0623 \u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0645\u0645\u0627\u0631\u0633\u0629',
            sectionLearn: '\u0627\u0644\u0642\u0633\u0645 \u0623: \u062a\u0639\u0644\u0645 \u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0648\u0627\u0644\u062b\u0642\u0627\u0641\u0629',
            sectionLearnSub: 'مسار تفاعلي للهجة المصرية ودروس الثقافة.',
            dailyStreak: '\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629',
            totalXp: '\u0645\u062c\u0645\u0648\u0639 XP',
            jump: '\u0627\u0646\u062a\u0642\u0644',
            progress: '\u0627\u0644\u062a\u0642\u062f\u0645',
            sectionAi: '\u0627\u0644\u0642\u0633\u0645 \u0628: \u0645\u0633\u0627\u0639\u062f \u0633\u0644\u064a\u0645 \u0627\u0644\u0630\u0643\u064a',
            sectionCommunity: '\u0627\u0644\u0642\u0633\u0645 \u062c: \u0645\u0644\u062a\u0642\u0649 \u0627\u0644\u0645\u062c\u062a\u0645\u0639',
            sectionProfile: '\u0627\u0644\u0642\u0633\u0645 \u062f: \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a \u0648\u0627\u0644\u062e\u062f\u0645\u0627\u062a',
            brandSupport: '\u062f\u0639\u0645 \u0627\u0644\u0644\u0627\u062c\u0626\u064a\u0646',
            localProfile: '\u0645\u0644\u0641 \u0633\u0644\u064a\u0645 \u0627\u0644\u0645\u062d\u0644\u064a',
            learningSnapshot: '\u0645\u0644\u062e\u0635 \u0627\u0644\u062a\u0642\u062f\u0645 \u0627\u0644\u0634\u062e\u0635\u064a',
            daysLabel: '\u064a\u0648\u0645',
            lessonsLabel: '\u062f\u0631\u0648\u0633',
            trackDialect: '\u0627\u0644\u0645\u0633\u0627\u0631 1: \u062a\u0639\u0644\u0645 \u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629',
            trackCulture: '\u0627\u0644\u0645\u0633\u0627\u0631 2: \u062a\u0639\u0644\u0645 \u0627\u0644\u062b\u0642\u0627\u0641\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629',
            datasetAvailable: '\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0645\u062a\u0627\u062d\u0629',
            datasetUnavailable: '\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629',
            loadingDataset: '\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062a\u0639\u0644\u0645...',
            privateProgress: '\u062a\u0642\u062f\u064a\u0631\u0627\u062a \u0627\u0644\u062a\u0642\u062f\u0645 \u0627\u0644\u062e\u0627\u0635\u0629 \u0628\u0646\u0634\u0627\u0637\u0643 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u062c\u0647\u0627\u0632 \u0648\u062d\u0633\u0627\u0628\u0643 \u0627\u0644\u0645\u062a\u0632\u0627\u0645\u0646.',
            rank: '\u0627\u0644\u0645\u0631\u062a\u0628\u0629',
            learnerName: '\u0627\u0633\u0645 \u0627\u0644\u0645\u062a\u0639\u0644\u0645',
            country: '\u0627\u0644\u062f\u0648\u0644\u0629',
            xpPoints: '\u0646\u0642\u0627\u0637 XP',
            badge: '\u0627\u0644\u0634\u0627\u0631\u0629',
            noLessons: 'لم تكمل أي درس بعد. أكمل الدرس 1 لكسب أول XP لك.',
            translatorPair: '\u062a\u0631\u062c\u0645 \u0628\u064a\u0646 \u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0648\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
            assistantPair: '\u0627\u0633\u0623\u0644 \u0645\u0633\u0627\u0639\u062f \u0633\u0644\u064a\u0645 \u0628\u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0623\u0648 \u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
            serviceFindHelp: '\u062f\u0648\u0651\u0631 \u0644\u064a \u0639\u0644\u0649 \u0645\u0633\u0627\u0639\u062f\u0629 \u0642\u0631\u064a\u0628\u0629', serviceChooseArea: '\u0627\u062e\u062a\u0627\u0631 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0628\u0646\u0641\u0633\u0643', serviceSearchArea: '\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0645\u0646\u0637\u0642\u0629', servicePermission: '\u0633\u064a\u0633\u062a\u062e\u062f\u0645 \u0633\u0644\u064a\u0645 \u0645\u0648\u0642\u0639\u0643 \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0644ترتيب \u0627ل\u062e\u062fم\u0627ت \u0627\u0644\u0645\u0648\u062b\u0642\u0629. \u0644ا \u064aتم \u062a\u062e\u0632\u064a\u0646\u0647 \u0623و \u062a\u062a\u0628\u0639\u0647.', serviceLocationDenied: '\u0644\u0645 \u064aتم \u0645ش\u0627ر\u0643ة \u0627\u0644\u0645وقع. \u0627ختر \u0645نطقة \u064aدو\u064a\u0627.', serviceGpsUnavailable: '\u0627لمو\u0642ع \u063aير \u0645تاح. \u0627ختر \u0645نطقة \u064aدوي\u0627.', serviceNoResults: '\u0644\u0627 \u062a\u0648\u062c\u062f \u062e\u062f\u0645\u0627\u062a \u0645\u0648\u062b\u0642\u0629 \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0644\u0645\u0646\u0637\u0642\u0629.', serviceGovernorate: '\u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0629', serviceCity: '\u0627\u0644\u0645\u062f\u064a\u0646\u0629 \u0623\u0648 \u0627\u0644\u0645\u0646\u0637\u0642\u0629', serviceSort: '\u062a\u0631\u062a\u064a\u0628', serviceNearest: '\u0627\u0644\u0623\u0642\u0631\u0628', serviceBestMatch: '\u0623\u0646\u0633\u0628 \u062a\u0637\u0627\u0628\u0642', serviceRecentlyVerified: '\u0627\u0644\u0623\u062d\u062f\u062b \u062a\u0648\u062b\u064a\u0642\u0627'
            ,brandSupport: '\u062f\u0639\u0645 \u0627\u0644\u0644\u0627\u062c\u0626\u064a\u0646'
            ,localProfile: '\u0645\u0644\u0641 \u0633\u0644\u064a\u0645 \u0627\u0644\u0645\u062d\u0644\u064a'
            ,learningSnapshot: '\u0645\u0644\u062e\u0635 \u0627\u0644\u062a\u0642\u062f\u0645 \u0627\u0644\u0634\u062e\u0635\u064a'
        },
        am: { coverageNotice: '\u1230\u121b\u1290\u1271 \u12a8\u1270\u1218\u1228\u1320\u12cd \u1265\u127b \u12ad\u120d\u120d \u12a0\u12ed\u1308\u129d\u121d\u1362 \u12e8\u130d\u133d\u1275 \u12a0\u1228\u1265\u129b \u12ed\u1308\129b\u120d\u1362', translationUnavailable: '\u1275\u122d\u1309\u121d \u12a0\u1208\u1270\u1308\1298\u121d\u1362', egyptianArabicOnly: '\u12e8\u130d\u133d\u1275 \u12a0\u1228\u1265\u129b \u12ed\u1308\u129b\u120d\u1362', languagePair: '\u12e8\u1270\u12a8\u1348\u1270 \u124b\1295\u124b\u1362' },
        so: { coverageNotice: 'Qaar ka mid ah waxyaabaha lama heli karo luqadda la doortay. Carabiga Masariga ah ayaa la muujiyaa marka uu jiro.', translationUnavailable: 'Turjumaad lagama heli karo luqadda la doortay.', egyptianArabicOnly: 'Kaliya lahjada Carabiga Masariga ah', languagePair: 'Lammaanaha luqadaha' },
        fr: { coverageNotice: 'Certains contenus ne sont pas disponibles dans la langue sélectionnée. Le contenu en arabe égyptien reste affiché lorsqu’il existe.', translationUnavailable: 'Traduction indisponible dans la langue sélectionnée.', egyptianArabicOnly: 'Contenu en arabe égyptien uniquement', languagePair: 'Paire de langues' },
        ti: { coverageNotice: '\u12ab\u12e5\u1273 \u12dd\u1270\u1218\u1228\u1338 \u12ed\u122d\u12a8\u1265\u1362 \u12d3\u1228\u1265\u129b \u130d\u1265\u133d \u12a3\u1265 \u12dd\u1205\u120d\u12cc \u12a5\u12cb\u1295 \u12ed\u122d\u12a8\u1265\u1362', translationUnavailable: '\u1275\u122d\u1309\u121d \u12a3\u12ed\u122d\u12a8\u1265\u1295\u1362', egyptianArabicOnly: '\u130d\u1265\u133d \u12d3\u1228\u1265\u129b \u130e\u1290\u1295\u1362', languagePair: '\u1213\u1218\u12f0\u1275 \u1265\u122d\u12a5\u1272' },
        sw: { coverageNotice: 'Baadhi ya maudhui hayapatikani katika lugha uliyochagua. Maudhui ya Kiarabu cha Misri yanaonyeshwa yanapopatikana.', translationUnavailable: 'Tafsiri haipatikani katika lugha uliyochagua.', egyptianArabicOnly: 'Maudhui ya Kiarabu cha Misri pekee', languagePair: 'Jozi ya lugha' },
        ha: { coverageNotice: 'Ba a samun wasu bayanai a harshen da aka zaba. Ana nuna Larabcin Masar idan akwai.', translationUnavailable: 'Ba a samun fassara a harshen da aka zaba.', egyptianArabicOnly: 'Abun cikin Larabcin Masar kawai', languagePair: 'Ma’auratan harsuna' },
        om: { coverageNotice: 'Qabiyyeen qabiyyee afaan filatametti hin argamu. Afaan Arabaa Gibxi yeroo jiru ni mul’ata.', translationUnavailable: 'Hiikni afaan filatametti hin argamu.', egyptianArabicOnly: 'Qabiyyee Afaan Arabaa Gibxi qofa', languagePair: 'Lama afaanii' }
    });

    const SERVICE_RUNTIME_TEXT = Object.freeze({
        en: { find: 'Find Help Near Me', area: 'Choose Area Manually', search: 'Search This Area', permission: 'Saleem uses your location once to sort verified services nearby. It is not stored or tracked.', denied: 'Location was not shared. Choose an area manually instead.', unavailable: 'Location is unavailable. Choose an area manually instead.', empty: 'No verified services match this area or category.', governorate: 'Governorate', city: 'City or area', sort: 'Sort', nearest: 'Nearest', best: 'Best match', recent: 'Recently verified' },
        ar: { find: '\u062f\u0648\u0651\u0631 \u0644\u064a \u0639\u0644\u0649 \u0645\u0633\u0627\u0639\u062f\u0629 \u0642\u0631\u064a\u0628\u0629', area: '\u0627\u062e\u062a\u0627\u0631 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0628\u0646\u0641\u0633\u0643', search: '\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0645\u0646\u0637\u0642\u0629', permission: '\u0633\u064a\u0633\u062a\u062e\u062f\u0645 \u0633\u0644\u064a\u0645 \u0645\u0648\u0642\u0639\u0643 \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0644\u062a\u0631\u062a\u064a\u0628 \u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u062b\u0642\u0629. \u0644\u0627 \u064a\u062a\u0645 \u062a\u062e\u0632\u064a\u0646\u0647 \u0623\u0648 \u062a\u062a\u0628\u0639\u0647.', denied: '\u0644\u0645 \u064a\u062a\u0645 \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0645\u0648\u0642\u0639. \u0627\u062e\u062a\u0631 \u0645\u0646\u0637\u0642\u0629 \u064a\u062f\u0648\u064a\u0627.', unavailable: '\u0627\u0644\u0645\u0648\u0642\u0639 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d. \u0627\u062e\u062a\u0631 \u0645\u0646\u0637\u0642\u0629 \u064a\u062f\u0648\u064a\u0627.', empty: '\u0644\u0627 \u062a\u0648\u062c\u062f \u062e\u062f\u0645\u0627\u062a \u0645\u0648\u062b\u0642\u0629 \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0644\u0645\u0646\u0637\u0642\u0629.', governorate: '\u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0629', city: '\u0627\u0644\u0645\u062f\u064a\u0646\u0629 \u0623\u0648 \u0627\u0644\u0645\u0646\u0637\u0642\u0629', sort: '\u062a\u0631\u062a\u064a\u0628', nearest: '\u0627\u0644\u0623\u0642\u0631\u0628', best: '\u0623\u0646\u0633\u0628 \u062a\u0637\u0627\u0628\u0642', recent: '\u0627\u0644\u0623\u062d\u062f\u062b \u062a\u0648\u062b\u064a\u0642\u0627' },
        fr: { find: 'Trouver de l’aide près de moi', area: 'Choisir une zone manuellement', search: 'Chercher dans cette zone', permission: 'Saleem utilise votre position une seule fois pour classer les services vérifiés à proximité. Elle n’est ni enregistrée ni suivie.', denied: 'Position non partagée. Choisissez plutôt une zone manuellement.', unavailable: 'Position indisponible. Choisissez une zone manuellement.', empty: 'Aucun service vérifié ne correspond à cette zone.', governorate: 'Gouvernorat', city: 'Ville ou zone', sort: 'Trier', nearest: 'Plus proche', best: 'Meilleure correspondance', recent: 'Vérifié récemment' },
        so: { find: 'Raadi caawimo ii dhow', area: 'Aagga gacanta ku dooro', search: 'Aaggan ka raadi', permission: 'Saleem wuxuu goobtaada isticmaalaa hal mar si uu u kala hormariyo adeegyada la xaqiijiyay. Lama kaydiyo ama lama raaco.', denied: 'Goobta lama wadaagin. Aag gacanta ku dooro.', unavailable: 'Goobtu ma heli karto. Aag gacanta ku dooro.', empty: 'Adeegyo la xaqiijiyay lagama helin aaggan.', governorate: 'Gobolka', city: 'Magaalada ama aagga', sort: 'Kala saar', nearest: 'Ugu dhow', best: 'Kuwa ugu habboon', recent: 'Dhawaan la xaqiijiyay' },
        ti: { find: 'ሓገዝ ኣብ ኣብያተይ ድለይ', area: 'ከባቢ ብኢድካ ምረጽ', search: 'ኣብዚ ከባቢ ድለይ', permission: 'Saleem ንኣገልግሎታት ንምስራዕ ቦታኻ ሓንሳብ ጥራይ ይጥቀመሉ። ኣይዕቀብን ኣይከታተልን።', denied: 'ቦታ ኣይተካፈልካን። ከባቢ ብኢድካ ምረጽ።', unavailable: 'ቦታ ኣይርከብን። ከባቢ ብኢድካ ምረጽ።', empty: 'ኣብዚ ከባቢ ዝተረጋገጸ ኣገልግሎት የለን።', governorate: 'ኣውራጃ', city: 'ከተማ ወይ ከባቢ', sort: 'ስርዓት', nearest: 'ዝቐረበ', best: 'ዝበለጸ ምስማማዕ', recent: 'ቀረባ ግዜ ዝተረጋገጸ' },
        sw: { find: 'Tafuta msaada karibu nami', area: 'Chagua eneo mwenyewe', search: 'Tafuta katika eneo hili', permission: 'Saleem hutumia eneo lako mara moja kupanga huduma zilizothibitishwa zilizo karibu. Halihifadhiwi wala kufuatiliwa.', denied: 'Eneo halikushirikiwa. Chagua eneo mwenyewe.', unavailable: 'Eneo halipatikani. Chagua eneo mwenyewe.', empty: 'Hakuna huduma iliyothibitishwa katika eneo hili.', governorate: 'Gavana', city: 'Mji au eneo', sort: 'Panga', nearest: 'Karibu zaidi', best: 'Inayolingana zaidi', recent: 'Imethibitishwa hivi karibuni' },
        ha: { find: 'Nemo taimako kusa da ni', area: 'Zabi yanki da hannu', search: 'Nemo a wannan yanki', permission: 'Saleem zai yi amfani da wurinka sau daya don jera tabbatattun ayyuka kusa. Ba a adana ko bin sa.', denied: 'Ba a raba wurin ba. Zabi yanki da hannu.', unavailable: 'Ba a samun wurin. Zabi yanki da hannu.', empty: 'Babu tabbataccen sabis a wannan yankin.', governorate: 'Gwamnati', city: 'Birni ko yanki', sort: 'Tsara', nearest: 'Mafi kusa', best: 'Mafi dacewa', recent: 'An tabbatar kwanan nan' },
        om: { find: 'Gargaarsa naannoo koo barbaadi', area: 'Naannoo harkaan filadhu', search: 'Naannoo kana keessa barbaadi', permission: 'Saleem tajaajiloota mirkanaa’an naannoo kee jiran tartiibsuuf bakka kee yeroo tokko qofa fayyadama. Hin kuufamu, hin hordofamus.', denied: 'Bakka hin qoodamne. Naannoo harkaan filadhu.', unavailable: 'Bakka hin argamne. Naannoo harkaan filadhu.', empty: 'Tajaajilli mirkanaa’e naannoo kana keessatti hin argamne.', governorate: 'Bulchiinsa', city: 'Magaalaa ykn naannoo', sort: 'Tartiibsi', nearest: 'Kan dhihoo', best: 'Kan caalaatti walsimu', recent: 'Dhiheenya mirkanaa’e' }
    });

    // Shared shell copy for legacy controls that now participate in the same
    // runtime localization contract as the learning and service surfaces.
    const PREMIUM_UI_TEXT = Object.freeze({
        en: { aiIntro: 'Conversational AI companion trained on native Egyptian dialect. Practice real scenarios, receive grammar feedback, and ask any questions.', aiScenarios: 'Interactive Roleplay Practice Scenarios', aiScenariosSub: 'Select a real-world scenario to practice conversation with Saleem AI:', scenarioCafe: 'Ordering at a Cafe (Ahwa Saada)', scenarioHospital: 'At the Hospital & Pharmacy', scenarioPolice: 'Police Station & Legal Protocol', scenarioRental: 'Apartment Lease Negotiation', scenarioTransport: 'Microbus & Taxi Directions', communityIntro: 'Refugee-safe peer learning space, discussion forums, practical resource sharing, weekly challenges, and community feedback.', forumAll: 'All Topics', forumLanguage: 'Language Questions', forumCulture: 'Cultural Discussions', forumTips: 'Local Area Tips', forumStories: 'Success Stories', postHeading: 'Post a Question or Tip', postTitlePlaceholder: 'Topic Title (e.g. Best Arabic language courses in Nasr City?)', postBodyPlaceholder: 'Share details or tips with fellow refugees...', submitPost: 'Submit Post', profileIntro: 'Personal learning dashboard, local Saleem profile, and verified-service access finder.' },
        ar: { aiIntro: '\u0645\u0633\u0627\u0639\u062f \u0645\u062d\u0627\u062f\u062b\u0629 \u0645\u062f\u0631\u0651\u0628 \u0639\u0644\u0649 \u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629. \u062a\u062f\u0631\u0651\u0628 \u0639\u0644\u0649 \u0645\u0648\u0627\u0642\u0641 \u062d\u0642\u064a\u0642\u064a\u0629 \u0648\u0627\u062d\u0635\u0644 \u0639\u0644\u0649 \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0646\u062d\u0648\u064a\u0629 \u0648\u0627\u0633\u0623\u0644 \u0623\u064a \u0633\u0624\u0627\u0644.', aiScenarios: '\u0645\u0648\u0627\u0642\u0641 \u062a\u062f\u0631\u064a\u0628 \u062a\u0641\u0627\u0639\u0644\u064a\u0629', aiScenariosSub: '\u0627\u062e\u062a\u0631 \u0645\u0648\u0642\u0641\u0627\u064b \u0645\u0646 \u0627\u0644\u062d\u064a\u0627\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629 \u0644\u0644\u062a\u062f\u0631\u0651\u0628 \u0645\u0639 \u0645\u0633\u0627\u0639\u062f \u0633\u0644\u064a\u0645:', scenarioCafe: '\u0637\u0644\u0628 \u0641\u064a \u0643\u0627\u0641\u064a\u0647 (\u0642\u0647\u0648\u0629 \u0633\u0627\u062f\u0629)', scenarioHospital: '\u0641\u064a \u0627\u0644\u0645\u0633\u062a\u0634\u0641\u0649 \u0648\u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629', scenarioPolice: '\u0642\u0633\u0645 \u0627\u0644\u0634\u0631\u0637\u0629 \u0648\u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629', scenarioRental: '\u0627\u0644\u062a\u0641\u0627\u0648\u0636 \u0639\u0644\u0649 \u0625\u064a\u062c\u0627\u0631 \u0634\u0642\u0629', scenarioTransport: '\u0627\u062a\u062c\u0627\u0647\u0627\u062a \u0627\u0644\u0645\u064a\u0643\u0631\u0648\u0628\u0627\u0635 \u0648\u0627\u0644\u062a\u0627\u0643\u0633\u064a', communityIntro: '\u0645\u0633\u0627\u062d\u0629 \u0622\u0645\u0646\u0629 \u0644\u0644\u062a\u0639\u0644\u0651\u0645 \u0645\u0639 \u0627\u0644\u0623\u0642\u0631\u0627\u0646 \u0648\u0645\u0646\u062a\u062f\u0649 \u0644\u0644\u0646\u0642\u0627\u0634 \u0648\u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0645\u0648\u0627\u0631\u062f \u0648\u062a\u062d\u062f\u064a\u0627\u062a \u0623\u0633\u0628\u0648\u0639\u064a\u0629.', forumAll: '\u0643\u0644 \u0627\u0644\u0645\u0648\u0636\u0648\u0639\u0627\u062a', forumLanguage: '\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0644\u063a\u0629', forumCulture: '\u0646\u0642\u0627\u0634\u0627\u062a \u0627\u0644\u062b\u0642\u0627\u0641\u0629', forumTips: '\u0646\u0635\u0627\u0626\u062d \u0627\u0644\u0645\u0646\u0627\u0637\u0642', forumStories: '\u0642\u0635\u0635 \u0627\u0644\u0646\u062c\u0627\u062d', postHeading: '\u0627\u0646\u0634\u0631 \u0633\u0624\u0627\u0644\u0627\u064b \u0623\u0648 \u0646\u0635\u064a\u062d\u0629', postTitlePlaceholder: '\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 (\u0645\u062b\u0627\u0644: \u0623\u0641\u0636\u0644 \u062f\u0648\u0631\u0627\u062a \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0641\u064a \u0645\u062f\u064a\u0646\u0629 \u0646\u0635\u0631\u061f)', postBodyPlaceholder: '\u0634\u0627\u0631\u0643 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644 \u0623\u0648 \u0627\u0644\u0646\u0635\u0627\u0626\u062d \u0645\u0639 \u0627\u0644\u0622\u062e\u0631\u064a\u0646...', submitPost: '\u0646\u0634\u0631 \u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0629', profileIntro: '\u0644\u0648\u062d\u0629 \u062a\u0639\u0644\u0651\u0645 \u0634\u062e\u0635\u064a\u0629 \u0648\u0645\u0644\u0641 \u0633\u0644\u064a\u0645 \u0627\u0644\u0645\u062d\u0644\u064a \u0648\u0623\u062f\u0627\u0629 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u062b\u0642\u0629.' },
        fr: { aiIntro: 'Assistant conversationnel entraîné sur le dialecte égyptien. Pratiquez des situations réelles, recevez des corrections et posez vos questions.', aiScenarios: 'Situations de pratique interactives', aiScenariosSub: 'Choisissez une situation réelle pour pratiquer avec l’assistant Saleem :', scenarioCafe: 'Commander dans un café (ahwa saada)', scenarioHospital: 'À l’hôpital et à la pharmacie', scenarioPolice: 'Commissariat et démarches juridiques', scenarioRental: 'Négocier le loyer d’un appartement', scenarioTransport: 'Itinéraires en microbus et taxi', communityIntro: 'Espace sûr d’apprentissage entre pairs, discussions, partage de ressources, défis hebdomadaires et retours de la communauté.', forumAll: 'Tous les sujets', forumLanguage: 'Questions de langue', forumCulture: 'Discussions culturelles', forumTips: 'Conseils locaux', forumStories: 'Histoires de réussite', postHeading: 'Publier une question ou un conseil', postTitlePlaceholder: 'Titre du sujet (ex. meilleurs cours d’arabe à Nasr City ?)', postBodyPlaceholder: 'Partagez des détails ou des conseils avec la communauté...', submitPost: 'Publier', profileIntro: 'Tableau de bord d’apprentissage, profil Saleem local et recherche de services vérifiés.' },
        so: { aiIntro: 'Kaaliye wada sheekeysi oo lagu tababaray lahjadda Masar. Ku celceli xaalado dhab ah, hel sixid naxwe, oo weydii su’aalahaaga.', aiScenarios: 'Xaalado tababar is-dhexgal ah', aiScenariosSub: 'Dooro xaalad nololeed si aad ula hadasho Kaaliyaha Saleem:', scenarioCafe: 'Dalbashada kafateeriyada (Ahwa Saada)', scenarioHospital: 'Isbitaalka iyo farmashiyaha', scenarioPolice: 'Saldhigga booliska iyo habraaca sharciga', scenarioRental: 'Gorgortanka kirada guri', scenarioTransport: 'Tilmaamaha bas-yar iyo taksi', communityIntro: 'Goob ammaan ah oo waxbarasho iyo wadaag khibrad ah, dood, khayraad, caqabado toddobaadle ah iyo jawaab-celin bulshada.', forumAll: 'Dhammaan mawduucyada', forumLanguage: 'Su’aalaha luqadda', forumCulture: 'Doodaha dhaqanka', forumTips: 'Talooyinka deegaanka', forumStories: 'Sheekooyinka guusha', postHeading: 'Qor su’aal ama talo', postTitlePlaceholder: 'Cinwaanka mawduuca (tusaale: koorsooyinka Carabiga ee ugu fiican Nasr City?)', postBodyPlaceholder: 'La wadaag faahfaahin ama talooyin...', submitPost: 'Gudbi qoraalka', profileIntro: 'Dashboard-ka waxbarashada, profile Saleem iyo raadinta adeegyada la xaqiijiyay.' },
        am: { aiIntro: '\u12e8\u130d\b5\u1275 \u12e8\u12a0\u134d \u124b\u1295\u124b \u12e8\u1230\u1208\u1300 \u12e8\u12cd\u12ed\u12ed\u1275 \u1228\u12f3\u1275\u1362 \u12e8\u12a5\u12cd\u1290\u1270\u129b \u1201\u1294\u1273\u12ce\u127d\u1295 \u12ed\u1208\u121b\u121d\u12f1\u1363 \u12e8\u1230\u12cb\u1230\u12cd \u12a5\u122d\u121b\u1275 \u12eb\u130d\u1299 \u12a5\u1293 \u1305\u12e7\u1270\u12cd\u1295 \u12ed\u1300\u121d\u1229\u1362', aiScenarios: '\u1270\u132d\u1263\u122b\u12ca \u12e8\u12cd\u12ed\u12ed\u1275 \u1201\u1294\u1273\u12ce\u127d', aiScenariosSub: '\u12a8\u1233\u120a\u121d \u130b\u122d \u1208\u1218\u1208\u121b\u1218\u12f5 \u12e8\u12a5\u12cd\u1290\u1270\u129b \u1205\u12ed\u12c8\u1275 \u1201\u1294\u1273 \u12ed\u121d\u1228\u1321\u1362', scenarioCafe: '\u1260\u12ab\u134c \u121b\u12d8\u12dd (\u12a0\u1205\u12cb \u1233\u12f3)', scenarioHospital: '\u1260\u1206\u1235\u1352\u1273\u120d\u1293 \u12e8\u1210\u12aa\u121d\u1293 \u1218\u12f5\u1210\u1292\u1275', scenarioPolice: '\u12e8\u1356\u120a\u1235 \u1303\u1275\u12eb\u1293 \u12e8\u1215\u130d \u1202\u12f0\u1275', scenarioRental: '\u12e8\u12a0\u1353\u122d\u1273\u121b \u12aa\u122b\u12ed \u12f5\u122d\u12f5\u122d', scenarioTransport: '\u12e8\u121a\u12ad\u122e\u1263\u1235\u1293 \u1273\u12ad\u1232 \u12a0\u1245\u1323\u132b', communityIntro: '\u12f0\u1205\u1295\u1290\u1271 \u12e8\u1270\u1320\u1260\u1240 \u12e8\u12a5\u1240\u12ee\u127d \u1218\u121b\u122a\u12eb\u1363 \u12cd\u12ed\u12ed\u1275\u1363 \u12e8\u1200\u1265\u1275 \u1218\u130b\u122b\u1275 \u12a5\u1293 \u12e8\u1233\u121d\u1295\u1275 \u1270\u132b\u12f3\u122e\u1276\u127d\u1362', forumAll: '\u1201\u1209\u121d \u122d\u12d5\u1236\u127d', forumLanguage: '\u12e8\u124b\u1295\u124b \u1305\u12e6\u1276\u127d', forumCulture: '\u12e8\u1263\u1205\u120d \u12cd\u12ed\u12ed\u1276\u127d', forumTips: '\u12e8\u12a0\u12ab\u1263\u1262 \u121d\u12ad\u122e\u127d', forumStories: '\u12e8\u1235\u12ac\u1275 \u1273\u122a\u12ab\u12ce\u127d', postHeading: '\u1305\u12e7\u1270 \u12c8\u12ed\u121d \u121d\u12ad\u122d \u12eb\u130b\u1229', postTitlePlaceholder: '\u12e8\u122d\u12a5\u1235 \u1235\u121d', postBodyPlaceholder: '\u12dd\u122d\u12dd\u122e\u127d\u1295 \u12eb\u130b\u1229...', submitPost: '\u120d\u1305\u1275 \u12eb\u1235\u1308\u1261', profileIntro: '\u12e8\u130d\u120d \u12e8\u1218\u121b\u122a\u12eb \u12ae\u1295\u1270\u1295\u1275\u1363 \u12e8\u1233\u120a\u121d \u1218\u1308\u1208\u132b\u1363 \u12e8\u1270\u1228\u130b\u1321 \u12a0\u1308\u120d\u130d\u120e\u1276\u127d \u1218\u1348\u130a\u12eb\u1362' },
        ti: { aiIntro: '\u1265\u124b\u1295\u124b \u130d\u1265\u133a \u12dd\u1230\u120d\u1300 \u12a3\u1308\u130b\u12dd\u1362 \u12a9\u1290\u1273\u1275 \u1270\u1208\u121b\u1218\u12f1\u1363 \u12a5\u122d\u121b\u1275 \u1230\u12cb\u1235\u12cd \u1270\u1240\u1260\u1209\u1363 \u120e\u1275\u12a3 \u12a3\u1245\u122d\u1261\u1362', aiScenarios: '\u1270\u130d\u1263\u122b\u12ca \u12dd\u122d\u122d\u1265 \u12a9\u1290\u1273\u1275', aiScenariosSub: '\u121d\u1235 \u1233\u120a\u121d \u12a5\u1295\u1270\u1208\u121b\u1218\u12f5 \u12a9\u1290\u1273\u1275 \u121d\u1228\u1329\u1362', scenarioCafe: '\u12a3\u1265 \u12ab\u134c \u121d\u12a5\u12db\u12dd', scenarioHospital: '\u12a3\u1265 \u1215\u12c1\u1235\u1352\u1273\u120d\u1295 \u134b\u122d\u121b\u1232\u1295', scenarioPolice: '\u1323\u1265\u12eb \u1356\u120a\u1235\u1295 \u1205\u130b\u12ca \u1235\u122d\u12d3\u1275\u1295', scenarioRental: '\u1293\u12ed \u12a3\u1353\u122d\u1273\u121b \u12ad\u122b\u12ed \u12f5\u122d\u12f2\u122d', scenarioTransport: '\u12a3\u1295\u1348\u1275 \u121a\u12ad\u122e\u1263\u1235\u1295 \u1273\u12ad\u1232\u1295', communityIntro: '\u12cd\u1201\u1235 \u12a3\u1265\u122e \u1270\u121b\u1203\u122e \u1266\u1273\u1363 \u12dd\u122d\u122d\u1265\u1363 \u121d\u12f5\u122b\u1275\u1295 \u121d\u12ad\u134b\u120d\u1362', forumAll: '\u12a9\u120e\u121d \u12a3\u122d\u12a5\u1235\u1273\u1275', forumLanguage: '\u1205\u1276\u1273\u1275 \u124b\u1295\u124b', forumCulture: '\u12dd\u122d\u122d\u1265 \u1263\u1205\u120a', forumTips: '\u121d\u12bd\u122a \u12a8\u1263\u1262', forumStories: '\u12db\u1295\u1273\u1273\u1275 \u12d3\u12c8\u1275', postHeading: '\u1205\u1276 \u12c8\u12ed \u121d\u12bd\u122a \u1208\u1325\u1349', postTitlePlaceholder: '\u12a3\u122d\u12a5\u1235\u1272', postBodyPlaceholder: '\u12dd\u122d\u12dd\u122d \u12a3\u12ab\u134d\u1209...', submitPost: '\u120d\u1305\u1352 \u1208\u12a3\u12bd', profileIntro: '\u1293\u12ed \u1275\u121d\u1205\u122d\u1272 \u12f3\u123d\u1266\u122d\u12f5\u1363 \u1293\u12ed \u1233\u120a\u121d \u1218\u1308\u1208\u132a\u1363 \u12cd\u1201\u1233\u1275 \u12a3\u1308\u120d\u130d\u120e\u1273\u1275 \u12f5\u1208\u12ed\u1362' },
        sw: { aiIntro: 'Msaidizi wa mazungumzo aliyefundishwa kwa lahaja ya Misri. Fanya mazoezi ya hali halisi, pata mrejesho wa sarufi na uliza maswali.', aiScenarios: 'Mazingira ya Mazoezi ya Mazungumzo', aiScenariosSub: 'Chagua hali ya maisha halisi ya kufanya mazoezi na Msaidizi Saleem:', scenarioCafe: 'Kuagiza kwenye cafe (Ahwa Saada)', scenarioHospital: 'Hospitalini na famasia', scenarioPolice: 'Kituo cha polisi na taratibu za kisheria', scenarioRental: 'Kujadiliana kodi ya nyumba', scenarioTransport: 'Maelekezo ya microbus na teksi', communityIntro: 'Nafasi salama ya kujifunza pamoja, mijadala, kushirikiana rasilimali, changamoto za kila wiki na maoni ya jamii.', forumAll: 'Mada zote', forumLanguage: 'Maswali ya lugha', forumCulture: 'Mijadala ya utamaduni', forumTips: 'Vidokezo vya eneo', forumStories: 'Hadithi za mafanikio', postHeading: 'Chapisha swali au ushauri', postTitlePlaceholder: 'Kichwa cha mada', postBodyPlaceholder: 'Shiriki maelezo au ushauri na jamii...', submitPost: 'Tuma chapisho', profileIntro: 'Dashibodi ya kujifunza, wasifu wa Saleem na kitafuta huduma zilizothibitishwa.' },
        ha: { aiIntro: 'Mataimakin tattaunawa da aka horar da shi kan harshen Masar. Yi atisaye kan yanayi na gaske, sami gyaran nahawu, kuma yi tambayoyi.', aiScenarios: 'Yanayin Horon Tattaunawa', aiScenariosSub: 'Zabi yanayi na rayuwa domin atisaye da Mataimakin Saleem:', scenarioCafe: 'Yin oda a cafe (Ahwa Saada)', scenarioHospital: 'Asibiti da kantin magani', scenarioPolice: 'Ofishin yan sanda da tsarin doka', scenarioRental: 'Tattaunawar kudin haya', scenarioTransport: 'Hanyar microbus da tasi', communityIntro: 'Wurin koyo mai aminci tare da yan uwa, tattaunawa, raba albarkatu, kalubalen mako-mako da raayoyin alumma.', forumAll: 'Dukkan batutuwa', forumLanguage: 'Tambayoyin harshe', forumCulture: 'Tattaunawar aladu', forumTips: 'Shawarwarin yanki', forumStories: 'Labarun nasara', postHeading: 'Wallafa tambaya ko shawara', postTitlePlaceholder: 'Taken batu', postBodyPlaceholder: 'Raba bayani ko shawara da alumma...', submitPost: 'Aika wallafa', profileIntro: 'Allon karatu, bayanin Saleem da mai nemo ayyukan da aka tabbatar.' },
        om: { aiIntro: 'Gargaarsa haasawa afaan Arabaa Gibxii irratti leenjifame. Haala dhugaa shaakali, sirreeffama caaslugaa argadhu, gaaffiis gaafadhu.', aiScenarios: 'Haala Shaakala Haasawaa', aiScenariosSub: 'Haala jireenya dhugaa tokko filadhu, Gargaarsa Saleem waliin shaakali:', scenarioCafe: 'Kaafee keessatti ajajuu (Ahwa Saada)', scenarioHospital: 'Hospitaalaa fi mana qorichaa', scenarioPolice: 'Buufata poolisii fi adeemsa seeraa', scenarioRental: 'Kiraa mana irratti marii', scenarioTransport: 'Qajeelfama microbus fi taaksii', communityIntro: 'Bakka barnoota hiriyootaa nageenya qabu, marii, qoodinsa qabeenyaa, qormaata torbanii fi yaada hawaasaa.', forumAll: 'Mata-dureewwan hunda', forumLanguage: 'Gaaffiiwwan afaanii', forumCulture: 'Marii aadaa', forumTips: 'Gorsa naannoo', forumStories: 'Seenaa milkaa inaa', postHeading: 'Gaaffii ykn gorsa maxxansi', postTitlePlaceholder: 'Mata-duree', postBodyPlaceholder: 'Bal ina ykn gorsa hawaasa waliin qoodi...', submitPost: 'Maxxansa ergi', profileIntro: 'Daashboordii barnootaa, piroofaayila Saleem fi tajaajila mirkanaa e barbaadi.' }
    });

    const PREMIUM_UI_OVERRIDES = Object.freeze({
        ar: { chatWelcome: '\u0623\u0647\u0644\u0627\u064b \u0648\u0633\u0647\u0644\u0627\u064b! \u0627\u0633\u0623\u0644 \u0633\u0624\u0627\u0644\u0627\u064b \u0623\u0648 \u0627\u062e\u062a\u0631 \u0645\u0648\u0642\u0641\u0627\u064b \u0644\u0644\u062a\u062f\u0631\u0651\u0628.', },
        am: { aiIntro: '\u12e8\u130d\u1265\u1275 \u12e8\u12a0\u134d \u124b\u1295\u124b \u12e8\u1230\u1208\u1300 \u12e8\u12cd\u12ed\u12ed\u1275 \u1228\u12f3\u1275\u1362 \u12e8\u12a5\u12cd\u1290\u1270\u129b \u1201\u1294\u1273\u12ce\u127d\u1295 \u12ed\u1208\u121b\u121d\u12f1\u1363 \u12e8\u1230\u12cb\u1230\u12cd \u12a5\u122d\u121b\u1275 \u12eb\u130d\u1299 \u12a5\u1293 \u1305\u12e7\u1270\u12cd\u1295 \u12ed\u1300\u121d\u1229\u1362' },
        ti: { chatTutor: '\u12a3\u1308\u130b\u12dd Saleem:' }
    });

    const CHAT_UI_TEXT = Object.freeze({
        en: { chatTutor: 'Saleem AI Tutor:', chatWelcome: 'Ahlan wa Sahlan! I am your Egyptian Dialect AI Companion. Ask me a question or choose a practice scenario.', quickMetro: 'Cairo Metro', quickRent: 'Apartment Rent', quickUnhcr: 'UNHCR Office', quickPharmacy: 'Pharmacy Phrases', chatPlaceholder: 'Type a message in your language or Egyptian Arabic...' },
        ar: { chatTutor: '\u0645\u0633\u0627\u0639\u062f \u0633\u0644\u064a\u0645:', chatWelcome: '\u0623\u0647\u0644\u0627\u064b \u0648\u0633\u0647\u0644\u0627\u064b! \u0627\u0633\u0623\u0644 \u0633\u0624\u0627\u0644\u0627\u064b \u0623\u0648 \u0627\u062e\u062a\u0631 \u0645\u0648\u0642\u1d34\u0641\u0627\u064b \u0644\u0644\u062a\u062f\u0631\u0651\u0628.', quickMetro: '\u0645\u062a\u0631\u0648 \u0627\u0644\u0642\u0627\u0647\u0631\u0629', quickRent: '\u0625\u064a\u062c\u0627\u0631 \u0634\u0642\u0629', quickUnhcr: '\u0645\u0643\u062a\u0628 UNHCR', quickPharmacy: '\u0639\u0628\u0627\u0631\u0627\u062a \u0627\u0644\u0635\u064a\u062f\u0644\u064a\u0629', chatPlaceholder: '\u0627\u0643\u062a\u0628 \u0631\u0633\u0627\u0644\u0629 \u0628\u0644\u063a\u062a\u0643 \u0623\u0648 \u0628\u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629...' },
        fr: { chatTutor: 'Assistant IA Saleem :', chatWelcome: 'Ahlan wa Sahlan ! Posez une question ou choisissez une situation pour pratiquer.', quickMetro: 'Métro du Caire', quickRent: 'Loyer d’un appartement', quickUnhcr: 'Bureau du HCR', quickPharmacy: 'Phrases à la pharmacie', chatPlaceholder: 'Écrivez un message en français ou en arabe égyptien...' },
        so: { chatTutor: 'Kaaliyaha AI Saleem:', chatWelcome: 'Ahlan wa Sahlan! Weydii su’aal ama dooro xaalad aad ku tababarto.', quickMetro: 'Metro Qaahira', quickRent: 'Kirada guri', quickUnhcr: 'Xafiiska UNHCR', quickPharmacy: 'Weedhaha farmashiyaha', chatPlaceholder: 'Ku qor fariin Af-Soomaali ama Carabi Masri ah...' },
        am: { chatTutor: '\u12e8\u1233\u120a\u121d AI \u1228\u12f3\u1275:', chatWelcome: '\u12a5\u1295\u12b3\u1295 \u12f0\u1205\u1293 \u1218\u1303\u127d! \u1305\u12e7\u1270\u12cd\u1295 \u12ed\u1300\u121d\u1229 \u12c8\u12ed\u121d \u12e8\u1218\u1228\u1218\u1229\u1275 \u1201\u1294\u1273 \u12ed\u121d\u1228\u1321\u1362', quickMetro: '\u12e8\u12ab\u1205\u122d \u1218\u1308\u1295\u1290\u1262\u12eb', quickRent: '\u12e8\u12a0\u1353\u122d\u1273\u121b \u12aa\u122b\u12ed', quickUnhcr: '\u12e8UNHCR \u1323\u1262\u12eb', quickPharmacy: '\u12e8\u1210\u12aa\u121d \u1218\u12f5\u1210\u1292\u1275 \u1218\u1308\u1293\u12db', chatPlaceholder: '\u1218\u122d\u1218\u122d \u1260\u1209\u12cb\u12e8\u1275 \u126b\u1295\u124b \u12c8\u12ed\u121d \u1260\u130d\u1265\u133d \u12a0\u1228\u1265\u129b \u12ed\u130b...' },
        ti: { chatTutor: '\u12a3\u1308\u130b\12dd Saleem:', chatWelcome: '\u12a5\u12b3\u1295 \u12f0\u1205\u1293 \u121d\u132b\u12bd! \u120e\u1275\u12a3 \u12a3\u1245\u122d\u1261 \u12c8\u12ed \u12a9\u1290\u1273\u1275 \u121d\u1228\u1329\u1362', quickMetro: '\u1218\u1270\u122e \u12ab\u12db\u1229', quickRent: '\u12ad\u122b\u12ed \u12a3\u1353\u122d\u1273\u121b', quickUnhcr: '\u12e8UNHCR \u1264\u1275', quickPharmacy: '\u1213\u1208\u12cd\u1272 \u134b\u122d\u121b\u1232', chatPlaceholder: '\u1213\u1260\u122c\u1273 \u1265\u127b\u12db\u1295\u12ab \u12c8\u12ed \u1265\u130d\u1265\u133a \u130d\u1265\u133a \u12a3\u12f5...' },
        sw: { chatTutor: 'Msaidizi wa AI Saleem:', chatWelcome: 'Ahlan wa Sahlan! Uliza swali au chagua mazingira ya kufanya mazoezi.', quickMetro: 'Metro ya Cairo', quickRent: 'Kodi ya nyumba', quickUnhcr: 'Ofisi ya UNHCR', quickPharmacy: 'Maneno ya famasia', chatPlaceholder: 'Andika ujumbe kwa Kiswahili au Kiarabu cha Misri...' },
        ha: { chatTutor: 'Mataimakin Saleem AI:', chatWelcome: 'Ahlan wa Sahlan! Yi tambaya ko zabi yanayin atisaye.', quickMetro: 'Metro na Cairo', quickRent: 'Kudin haya', quickUnhcr: 'Ofishin UNHCR', quickPharmacy: 'Kalmomin kantin magani', chatPlaceholder: 'Rubuta sako da Hausa ko Larabcin Masar...' },
        om: { chatTutor: 'Gargaarsa AI Saleem:', chatWelcome: 'Ahlan wa Sahlan! Gaaffii gaafadhu ykn haala shaakalaa filadhu.', quickMetro: 'Metro Qaahiraa', quickRent: 'Kiraa mana', quickUnhcr: 'Waajjira UNHCR', quickPharmacy: 'Jechoota mana qorichaa', chatPlaceholder: 'Ergaa Afaan Oromoo ykn Afaan Arabaa Gibxiitiin barreessi...' }
    });

    const APP_SHELL_TEXT = Object.freeze({
        en: { daysLabel: 'Days', lessonsLabel: 'Lessons', sectionLearn: 'Section A: Learn Egyptian & Culture Path', sectionLearnSub: 'Interactive Egyptian dialect path with situational practice and culture lessons.', dailyStreak: 'Daily Streak', totalXp: 'Total XP', jump: 'Jump', progress: 'Progress', sectionAi: 'Section B: Saleem AI (Egyptian Dialect AI Tutor)', sectionCommunity: 'Section C: Refugee Community Hub & Peer Forums', sectionProfile: 'Section D: Profile & Legal Institutions Access', brandSupport: 'Refugee Support', localProfile: 'Local Saleem profile', learningSnapshot: 'Personal Learning Snapshot', loadingDataset: 'Loading learning dataset...', privateProgress: 'Private progress estimates from your activity on this device and synced account.', rank: 'Rank', learnerName: 'Learner Name', country: 'Country', xpPoints: 'XP Points', badge: 'Badge', noLessons: 'No lessons completed yet! Complete Lesson 1 to earn your first XP.', mentorHeading: 'Mentor Matching & Volunteer Support', mentorSub: 'Connect with advanced learners and verified local volunteers speaking your native language.', weeklyChallenge: 'Weekly Community Challenge', weeklyChallengeSub: 'Complete this Egyptian learning challenge and earn the Cairo Pioneer badge!', requestMentor: 'Request Peer Mentor', discussionFeed: 'Community Discussion Feed', moderatedSafe: 'Moderated & Safe', reviewHeading: 'Rate Saleem & Recommend Improvements', ratingScore: 'Rating Score:', reviewHelpPlaceholder: 'Share how Saleem helped you in Egypt...', reviewImprovementPlaceholder: 'Recommended improvement (optional)...', submitFeedback: 'Submit Feedback', communityAverage: 'Community Average Rating', noPublicReviews: 'No public reviews yet', feedbackFeed: 'Community Feedback Feed', localAppProfile: 'Local app profile', saleemPass: 'Saleem Pass', countryOrigin: 'Country of Origin', saleemUserId: 'Saleem User ID', offlineCloud: 'Offline & Cloud Synchronized', editProfile: 'Edit Profile', learningMetrics: 'Personal Learning Metrics', wordsLearned: 'Words Learned', phrasesMastered: 'Phrases Mastered', daysStreak: 'Days Streak', level: 'Level', beginner: 'Beginner', downloadOffline: 'Download Content for Offline Use', verifiedServices: 'Verified Services & Refugee Access Finder', verifiedServicesSub: 'Source-backed directory for UNHCR, legal aid, healthcare, and emergency contacts. Always verify hours before visiting.', searchInstitution: 'Search institution by name or location...', allInstitutions: 'All Institutions', catUnhcr: 'UNHCR & UN', catImmigration: 'Immigration & Passports', catHealth: 'Health & Emergency Clinics', catLegal: 'Legal Aid NGOs', catPolice: 'Police Stations', mapFallbackTitle: 'Cairo & Giza Verified-Service Directory', mapFallbackText: 'Use the cards below for source links, direct calls, and map directions. Embedded maps stay disabled until a real Maps key is configured outside source control.' },
        ar: { daysLabel: '\u0623\u064a\u0627\u0645', lessonsLabel: '\u062f\u0631\u0648\u0633', sectionLearn: '\u0627\u0644\u0642\u0633\u0645 \u0623: \u062a\u0639\u0644\u0645 \u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0648\u0627\u0644\u062b\u0642\u0627\u0641\u0629', sectionLearnSub: '\u0645\u0633\u0627\u0631 \u062a\u0641\u0627\u0639\u0644\u064a \u0644\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0648\u062f\u0631\u0648\u0633 \u0627\u0644\u062b\u0642\u0627\u0641\u0629.', dailyStreak: '\u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u064a\u0648\u0645\u064a\u0629', totalXp: '\u0645\u062c\u0645\u0648\u0639 XP', jump: '\u0627\u0646\u062a\u0642\u0644', progress: '\u0627\u0644\u062a\u0642\u062f\u0645', sectionAi: '\u0627\u0644\u0642\u0633\u0645 \u0628: \u0645\u0633\u0627\u0639\u062f \u0633\u0644\u064a\u0645 \u0627\u0644\u0630\u0643\u064a', sectionCommunity: '\u0627\u0644\u0642\u0633\u0645 \u062c: \u0645\u0644\u062a\u0642\u0649 \u0627\u0644\u0645\u062c\u062a\u0645\u0639', sectionProfile: '\u0627\u0644\u0642\u0633\u0645 \u062f: \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a \u0648\u0627\u06484\u062e\u062f\u0645\u0627\u062a', brandSupport: '\u062f\u0639\u0645 \u0627\u0644\u0644\u0627\u062c\u0626\u064a\u0646', localProfile: '\u0645\u0644\u0641 \u0633\u0644\u064a\u0645 \u0627\u0644\u0645\u062d\u0644\u064a', learningSnapshot: '\u0645\u0644\u062e\u0635 \u0627\u0644\u062a\u0642\u062f\u0645 \u0627\u0644\u0634\u062e\u0635\u064a', loadingDataset: '\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u062a\u0639\u0644\u0645...', privateProgress: '\u062a\u0642\u062f\u064a\u0631\u0627\u062a \u0627\u0644\u062a\u0642\u062f\u0645 \u0627\u0644\u062e\u0627\u0635\u0629 \u0628\u0646\u0634\u0627\u0637\u0643 \u0648\u062d\u0633\u0627\u0628\u0643 \u0627\u0644\u0645\u062a\u0632\u0627\u0645\u0646.', rank: '\u0627\u0644\u0645\u0631\u062a\u0628\u0629', learnerName: '\u0627\u0633\u0645 \u0627\u0644\u0645\u062a\u0639\u0644\u0645', country: '\u0627\u0644\u062f\u0648\u0644\u0629', xpPoints: '\u0646\u0642\u0627\u0637 XP', badge: '\u0627\u0644\u0634\u0627\u0631\u0629', noLessons: '\u0644\u0645 \u062a\u0643\u0645\u0644 \u0623\u064a \u062f\u0631\u0633 \u0628\u0639\u062f. \u0623\u0643\u0645\u0644 \u0627\u0644\u062f\u0631\u0633 1 \u0644\u0643\u0633\u0628 \u0623\u0648\u0644 XP.', mentorHeading: '\u062a\u0648\u0641\u064a\u0642 \u0627\u0644\u0645\u0631\u0634\u062f\u064a\u0646 \u0648\u062f\u0639\u0645 \u0627\u0644\u0645\u062a\u0637\u0648\u0639\u064a\u0646', mentorSub: '\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u062a\u0639\u0644\u0645\u064a\u0646 \u0645\u062a\u0642\u062f\u0645\u064a\u0646 \u0648\u0645\u062a\u0637\u0648\u0639\u064a\u0646 \u0645\u0648\u062b\u0648\u0642\u064a\u0646 \u064a\u062a\u062d\u062f\u062b\u0648\u0646 \u0644\u063a\u062a\u0643.', weeklyChallenge: '\u062a\u062d\u062f\u064a \u0627\u0644\u0623\u0633\u0628\u0648\u0639', weeklyChallengeSub: '\u0623\u0643\u0645\u0644 \u062a\u062d\u062f\u064a \u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0648\u0627\u0643\u0633\u0628 \u0634\u0627\u0631\u0629 \u0631\u0627\u0626\u062f \u0627\u0644\u0642\u0627\u0647\u0631\u0629!', requestMentor: '\u0627\u0637\u0644\u0628 \u0645\u0631\u0634\u062f\u0627\u064b', discussionFeed: '\u0645\u0646\u062a\u062f\u0649 \u0646\u0642\u0627\u0634 \u0627\u0644\u0645\u062c\u062a\u0645\u0639', moderatedSafe: '\u0622\u0645\u0646 \u0648\u062a\u062d\u062a \u0627\u0644\u0625\u0634\u0631\u0627\u0641', reviewHeading: '\u0642\u064a\u0651\u0645 \u0633\u0644\u064a\u0645 \u0648\u0627\u0642\u062a\u0631\u062d \u062a\u062d\u0633\u064a\u0646\u0627\u062a', ratingScore: '\u062f\u0631\u062c\u0629 \u0627\u0644\u062a\u0642\u064a\u064a\u0645:', reviewHelpPlaceholder: '\u0634\u0627\u0631\u0643 \u0643\u064a\u0641 \u0633\u0627\u0639\u062f\u0643 \u0633\u0644\u064a\u0645 \u0641\u064a \u0645\u0635\u0631...', reviewImprovementPlaceholder: '\u062a\u062d\u0633\u064a\u0646 \u0645\u0642\u062a\u0631\u062d (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)...', submitFeedback: '\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a', communityAverage: '\u0645\u062a\u0648\u0633\u0637 \u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u0645\u062c\u062a\u0645\u0639', noPublicReviews: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0631\u0627\u062c\u0639\u0627\u062a \u0639\u0627\u0645\u0629 \u0628\u0639\u062f', feedbackFeed: '\u0645\u0646\u0634\u0648\u0631\u0627\u062a \u0627\u0644\u0645\u062c\u062a\u0645\u0639', localAppProfile: '\u0645\u0644\u0641 \u0627\u0644\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0645\u062d\u0644\u064a', saleemPass: '\u0628\u0637\u0627\u0642\u0629 \u0633\u0644\u064a\u0645', countryOrigin: '\u0628\u0644\u062f \u0627\u0644\u0623\u0635\u0644', saleemUserId: '\u0645\u0639\u0631\u0651\u0641 \u0645\u0633\u062a\u062e\u062f\u0645 \u0633\u0644\u064a\u0645', offlineCloud: '\u0645\u062a\u0632\u0627\u0645\u0646 \u0645\u0639 \u0627\u0644\u0633\u062d\u0627\u0628\u0629 \u0648\u0628\u062f\u0648\u0646 \u0627\u062a\u0635\u0627\u0644', editProfile: '\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0644\u0641', learningMetrics: '\u0645\u0624\u0634\u0631\u0627\u062a \u0627\u0644\u062a\u0639\u0644\u0645 \u0627\u0644\u0634\u062e\u0635\u064a', wordsLearned: '\u0643\u0644\u0645\u0627\u062a \u062a\u0645 \u062a\u0639\u0644\u0645\u0647\u0627', phrasesMastered: '\u0639\u0628\u0627\u0631\u0627\u062a \u0645\u062a\u0642\u0646\u0629', daysStreak: '\u0623\u064a\u0627\u0645 \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0629', level: '\u0645\u0633\u062a\u0648\u0649', beginner: '\u0645\u0628\u062a\u062f\u0626', downloadOffline: '\u062a\u0646\u0632\u064a\u0644 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0644\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0628\u062f\u0648\u0646 \u0627\u062a\u0635\u0627\u0644', verifiedServices: '\u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u062b\u0642\u0629 \u0648\u0627\u0644\u0628\u062d\u062b \u0639\u0646 \u0627\u0644\u0645\u0633\u0627\u0639\u062f\u0627\u062a', verifiedServicesSub: '\u062f\u0644\u064a\u0644 \u0645\u0648\u062b\u0642 \u0644\u0644\u0645\u0641\u0648\u0636\u064a\u0629 \u0648\u0627\u0644\u0645\u0633\u0627\u0639\u062f\u0627\u062a \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629 \u0648\u0627\u0644\u0635\u062d\u064a\u0629. \u062a\u0623\u0643\u062f \u062f\u0627\u0626\u0645\u0627\u064b \u0645\u0646 \u0627\u0644\u0645\u0648\u0627\u0639\u064a\u062f \u0642\u0628\u0644 \u0627\u0644\u0632\u064a\u0627\u0631\u0629.', searchInstitution: '\u0627\u0628\u062d\u062b \u0639\u0646 \u0645\u0624\u0633\u0633\u0629 \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u0648\u0642\u0639...', allInstitutions: '\u0643\u0644 \u0627\u0644\u0645\u0624\u0633\u0633\u0627\u062a', catUnhcr: 'UNHCR & UN', catImmigration: '\u0627\u0644\u0647\u062c\u0631\u0629 \u0648\u062c\u0648\u0627\u0632\u0627\u062a \u0627\u0644\u0633\u0641\u0631', catHealth: '\u0627\u0644\u0635\u062d\u0629 \u0648\u0627\u0644\u0637\u0648\u0627\u0631\u0626', catLegal: '\u0645\u0646\u0638\u0645\u0627\u062a \u0627\u0644\u0645\u0633\u0627\u0639\u062f\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u064a\u0629', catPolice: '\u0645\u0631\u0627\u0643\u0632 \u0627\u0644\u0634\u0631\u0637\u0629', mapFallbackTitle: '\u062f\u0644\u064a\u0644 \u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0648\u062b\u0642\u0629 \u0641\u064a \u0627\u0644\u0642\u0627\u0647\u0631\u0629 \u0648\u0627\u0644\u062c\u064a\u0632\u0629', mapFallbackText: '\u0627\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u0628\u0637\u0627\u0642\u0627\u062a \u0644\u0641\u062a\u062d \u0627\u0644\u0645\u0635\u0627\u062f\u0631 \u0648\u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0648\u0627\u06484\u062c\u0647\u0627\u062a. \u0627\u0644\u062e\u0631\u0627\u0626\u0637 \u0627\u0644\u0645\u062f\u0645\u062c\u0629 \u0645\u0648\u0642\u0648\u0641\u0629 \u062d\u062a\u0649 \u062a\u0643\u0648\u0646 \u0645\u0641\u062a\u0627\u062d \u062e\u0631\u0627\u0626\u0637 \u062d\u0642\u064a\u0642\u064a \u0645\u0636\u0628\u0648\u0637\u0627\u064b \u062e\u0627\u0631\u062c \u0627\u0644\u0643\u0648\u062f.' },
        fr: { daysLabel: 'Jours', lessonsLabel: 'Leçons', sectionLearn: 'Section A : Apprendre l’égyptien et la culture', sectionLearnSub: 'Parcours interactif d’arabe égyptien avec situations pratiques et leçons culturelles.', dailyStreak: 'Série quotidienne', totalXp: 'XP total', jump: 'Aller à', progress: 'Progression', sectionAi: 'Section B : Assistant Saleem', sectionCommunity: 'Section C : Centre communautaire', sectionProfile: 'Section D : Profil et services', brandSupport: 'Soutien aux réfugiés', localProfile: 'Profil local Saleem', learningSnapshot: 'Résumé de votre apprentissage', loadingDataset: 'Chargement des données...', privateProgress: 'Estimations privées de votre activité sur cet appareil et votre compte synchronisé.', rank: 'Rang', learnerName: 'Nom de l’apprenant', country: 'Pays', xpPoints: 'Points XP', badge: 'Badge', noLessons: 'Aucune leçon terminée. Terminez la leçon 1 pour gagner votre premier XP.', mentorHeading: 'Mentorat et soutien bénévole', mentorSub: 'Échangez avec des apprenants avancés et des bénévoles locaux vérifiés qui parlent votre langue.', weeklyChallenge: 'Défi communautaire hebdomadaire', weeklyChallengeSub: 'Terminez le défi d’arabe égyptien et gagnez le badge Pionnier du Caire !', requestMentor: 'Demander un mentor', discussionFeed: 'Fil de discussion communautaire', moderatedSafe: 'Modéré et sûr', reviewHeading: 'Évaluer Saleem et proposer des améliorations', ratingScore: 'Note :', reviewHelpPlaceholder: 'Expliquez comment Saleem vous a aidé en Égypte...', reviewImprovementPlaceholder: 'Amélioration recommandée (facultatif)...', submitFeedback: 'Envoyer un retour', communityAverage: 'Note moyenne de la communauté', noPublicReviews: 'Aucun avis public pour le moment', feedbackFeed: 'Retours de la communauté', localAppProfile: 'Profil local de l’application', saleemPass: 'Pass Saleem', countryOrigin: 'Pays d’origine', saleemUserId: 'Identifiant utilisateur Saleem', offlineCloud: 'Synchronisé hors ligne et avec le cloud', editProfile: 'Modifier le profil', learningMetrics: 'Indicateurs d’apprentissage', wordsLearned: 'Mots appris', phrasesMastered: 'Expressions maîtrisées', daysStreak: 'Jours de série', level: 'Niveau', beginner: 'Débutant', downloadOffline: 'Télécharger le contenu hors ligne', verifiedServices: 'Services vérifiés et recherche d’aide', verifiedServicesSub: 'Annuaire vérifié de services du HCR, d’aide juridique, de santé et d’urgence. Vérifiez toujours les horaires.', searchInstitution: 'Rechercher une institution par nom ou lieu...', allInstitutions: 'Toutes les institutions', catUnhcr: 'HCR et ONU', catImmigration: 'Immigration et passeports', catHealth: 'Santé et urgences', catLegal: 'ONG d’aide juridique', catPolice: 'Postes de police', mapFallbackTitle: 'Annuaire vérifié du Caire et de Gizeh', mapFallbackText: 'Utilisez les cartes pour les sources, appels et itinéraires. Les cartes intégrées restent désactivées sans clé Maps configurée hors du code.' },
        so: { daysLabel: 'Maalmo', lessonsLabel: 'Casharro', sectionLearn: 'Qaybta A: Baro Carabiga Masar iyo dhaqanka', sectionLearnSub: 'Jid waxbarasho oo Carabi Masri ah leh tababar xaalado iyo casharro dhaqan.', dailyStreak: 'Silsiladda maalinlaha', totalXp: 'Wadarta XP', jump: 'U bood', progress: 'Horumar', sectionAi: 'Qaybta B: Kaaliyaha Saleem', sectionCommunity: 'Qaybta C: Xarunta bulshada', sectionProfile: 'Qaybta D: Profile iyo adeegyada', brandSupport: 'Taageerada qaxootiga', localProfile: 'Profile Saleem ee deegaanka', learningSnapshot: 'Kooban waxbarashadaada', loadingDataset: 'Xogta waa la soo dejinayaa...', privateProgress: 'Qiyaasaha horumarka gaarka ah ee qalabkan iyo koontadaada la isku waafajiyay.', rank: 'Darajo', learnerName: 'Magaca ardayga', country: 'Dalka', xpPoints: 'Dhibcaha XP', badge: 'Astaanta', noLessons: 'Cashar lama dhammayn. Dhammaystir casharka 1 si aad u hesho XP-gaaga koowaad.', mentorHeading: 'Isku xirka macallimiinta iyo taageerada mutadawiciinta', mentorSub: 'La xiriir arday horumarsan iyo mutadawiciin la xaqiijiyay oo ku hadla luqaddaada.', weeklyChallenge: 'Caqabadda bulshada ee toddobaadlaha', weeklyChallengeSub: 'Dhammaystir caqabadda Carabiga Masar oo hel astaanta Hormuudka Qaahira!', requestMentor: 'Codso hagaha ardayda', discussionFeed: 'Doodda bulshada', moderatedSafe: 'La ilaaliyo oo ammaan ah', reviewHeading: 'Qiimee Saleem oo soo jeedi horumarin', ratingScore: 'Dhibcaha qiimeynta:', reviewHelpPlaceholder: 'La wadaag sida Saleem kaaga caawiyay Masar...', reviewImprovementPlaceholder: 'Horumarin lagu taliyay (ikhtiyaari)...', submitFeedback: 'Gudbi jawaab-celin', communityAverage: 'Celceliska qiimeynta bulshada', noPublicReviews: 'Weli ma jiraan faallooyin dadweyne', feedbackFeed: 'Jawaab-celinta bulshada', localAppProfile: 'Profile-ka app-ka deegaanka', saleemPass: 'Baas Saleem', countryOrigin: 'Dalka asal ahaan', saleemUserId: 'Aqoonsiga isticmaalaha Saleem', offlineCloud: 'Offline iyo cloud waa la isku waafajiyay', editProfile: 'Wax ka beddel profile', learningMetrics: 'Cabbirrada waxbarashada', wordsLearned: 'Erayada la bartay', phrasesMastered: 'Weedhaha la bartay', daysStreak: 'Maalmaha silsiladda', level: 'Heer', beginner: 'Bilow', downloadOffline: 'Soo dejiso xogta offline', verifiedServices: 'Adeegyada la xaqiijiyay iyo raadinta caawimada', verifiedServicesSub: 'Hagaha la xaqiijiyay ee UNHCR, gargaarka sharciga, caafimaadka iyo xaaladaha degdegga ah. Hubi saacadaha.', searchInstitution: 'Raadi hay’ad magac ama meel...', allInstitutions: 'Dhammaan hay’adaha', catUnhcr: 'UNHCR iyo UN', catImmigration: 'Socdaalka iyo baasaboorrada', catHealth: 'Caafimaad iyo rugaha degdegga', catLegal: 'NGO-yada gargaarka sharciga', catPolice: 'Saldhigyada booliska', mapFallbackTitle: 'Hagaha adeegyada la xaqiijiyay ee Qaahira iyo Giza', mapFallbackText: 'Isticmaal kaararka hoose si aad u aragto ilaha, wicitaannada iyo tilmaamaha. Khariidadaha ku dhex jira way xiran yihiin ilaa furaha Maps la dejiyo.' },
        sw: { daysLabel: 'Siku', lessonsLabel: 'Masomo', sectionLearn: 'Sehemu A: Jifunze Kiarabu cha Misri na utamaduni', sectionLearnSub: 'Njia ya maingiliano ya Kiarabu cha Misri yenye mazoezi ya hali na masomo ya utamaduni.', dailyStreak: 'Mfululizo wa kila siku', totalXp: 'XP yote', jump: 'Nenda', progress: 'Maendeleo', sectionAi: 'Sehemu B: Msaidizi wa Saleem', sectionCommunity: 'Sehemu C: Kituo cha jamii', sectionProfile: 'Sehemu D: Wasifu na huduma', brandSupport: 'Msaada wa wakimbizi', localProfile: 'Wasifu wa Saleem wa eneo', learningSnapshot: 'Muhtasari wa kujifunza', loadingDataset: 'Inapakia data...', privateProgress: 'Makadirio ya maendeleo ya faragha kutoka kwenye kifaa na akaunti yako iliyosawazishwa.', rank: 'Nafasi', learnerName: 'Jina la mwanafunzi', country: 'Nchi', xpPoints: 'Pointi za XP', badge: 'Beji', noLessons: 'Hakuna somo lililokamilika. Kamilisha somo la 1 kupata XP yako ya kwanza.', mentorHeading: 'Ulinganishaji wa washauri na msaada wa kujitolea', mentorSub: 'Ungana na wanafunzi wa juu na wajitolea waliothibitishwa wanaozungumza lugha yako.', weeklyChallenge: 'Changamoto ya jamii ya kila wiki', weeklyChallengeSub: 'Kamilisha changamoto ya Kiarabu cha Misri upate beji ya Mwanzilishi wa Cairo!', requestMentor: 'Omba mshauri', discussionFeed: 'Mijadala ya jamii', moderatedSafe: 'Inasimamiwa na salama', reviewHeading: 'Kadiria Saleem na pendekeza maboresho', ratingScore: 'Alama ya ukadiriaji:', reviewHelpPlaceholder: 'Shiriki jinsi Saleem alivyokusaidia Misri...', reviewImprovementPlaceholder: 'Uboreshaji unaopendekezwa (hiari)...', submitFeedback: 'Tuma maoni', communityAverage: 'Wastani wa ukadiriaji wa jamii', noPublicReviews: 'Hakuna maoni ya umma bado', feedbackFeed: 'Mrejesho wa jamii', localAppProfile: 'Wasifu wa programu wa eneo', saleemPass: 'Pasi ya Saleem', countryOrigin: 'Nchi ya asili', saleemUserId: 'Kitambulisho cha mtumiaji wa Saleem', offlineCloud: 'Imesawazishwa offline na cloud', editProfile: 'Hariri wasifu', learningMetrics: 'Vipimo vya kujifunza', wordsLearned: 'Maneno yaliyofunzwa', phrasesMastered: 'Misemo iliyomilikiwa', daysStreak: 'Siku za mfululizo', level: 'Kiwango', beginner: 'Mwanzo', downloadOffline: 'Pakua maudhui ya kutumia offline', verifiedServices: 'Huduma zilizothibitishwa na kitafuta msaada', verifiedServicesSub: 'Orodha iliyothibitishwa ya UNHCR, msaada wa kisheria, afya na dharura. Thibitisha saa kabla ya kutembelea.', searchInstitution: 'Tafuta taasisi kwa jina au eneo...', allInstitutions: 'Taasisi zote', catUnhcr: 'UNHCR na UN', catImmigration: 'Uhamiaji na pasipoti', catHealth: 'Afya na kliniki za dharura', catLegal: 'NGO za msaada wa kisheria', catPolice: 'Vituo vya polisi', mapFallbackTitle: 'Orodha ya huduma zilizothibitishwa Cairo na Giza', mapFallbackText: 'Tumia kadi kuona vyanzo, kupiga simu na maelekezo. Ramani zilizopachikwa zimezimwa hadi ufunguo halisi wa Maps usanidiwe.' },
        ha: { daysLabel: 'Kwanaki', lessonsLabel: 'Darussa', sectionLearn: 'Sashe A: Koyi Larabcin Masar da al’adu', sectionLearnSub: 'Hanyar koyon Larabcin Masar mai atisayen yanayi da darussan al’adu.', dailyStreak: 'Jerin yau da kullum', totalXp: 'Jimillar XP', jump: 'Je zuwa', progress: 'Ci gaba', sectionAi: 'Sashe B: Mataimakin Saleem', sectionCommunity: 'Sashe C: Cibiyar al’umma', sectionProfile: 'Sashe D: Profile da ayyuka', brandSupport: 'Tallafin ’yan gudun hijira', localProfile: 'Profile na Saleem na gida', learningSnapshot: 'Takaitaccen karatu', loadingDataset: 'Ana loda bayanai...', privateProgress: 'Ƙididdigar ci gaban sirri daga wannan na’ura da asusun da aka daidaita.', rank: 'Matsayi', learnerName: 'Sunan mai koyo', country: 'Ƙasa', xpPoints: 'Makin XP', badge: 'Alama', noLessons: 'Ba a kammala darasi ba. Kammala darasi na 1 don samun XP na farko.', mentorHeading: 'Haɗa masu ba da shawara da taimakon masu sa kai', mentorSub: 'Haɗu da masu koyo na gaba da masu sa kai da aka tabbatar waɗanda ke magana da harshenka.', weeklyChallenge: 'Kalubalen al’umma na mako-mako', weeklyChallengeSub: 'Kammala kalubalen Larabcin Masar ka sami alamar Majagaba ta Alkahira!', requestMentor: 'Nemi mai ba da shawara', discussionFeed: 'Tattaunawar al’umma', moderatedSafe: 'Ana sa ido kuma lafiya', reviewHeading: 'Kimanta Saleem kuma ba da shawarar inganta', ratingScore: 'Makin kimantawa:', reviewHelpPlaceholder: 'Bayyana yadda Saleem ya taimake ka a Masar...', reviewImprovementPlaceholder: 'Ingantawa da aka ba da shawara (zaɓi)...', submitFeedback: 'Aika ra’ayi', communityAverage: 'Matsakaicin kimar al’umma', noPublicReviews: 'Babu ra’ayoyin jama’a tukuna', feedbackFeed: 'Ra’ayoyin al’umma', localAppProfile: 'Profile na app na gida', saleemPass: 'Katin Saleem', countryOrigin: 'Ƙasar asali', saleemUserId: 'ID ɗin mai amfani na Saleem', offlineCloud: 'An daidaita offline da cloud', editProfile: 'Gyara profile', learningMetrics: 'Ma’aunin koyo', wordsLearned: 'Kalmomin da aka koya', phrasesMastered: 'Jimlolin da aka ƙware', daysStreak: 'Kwanakin jere', level: 'Mataki', beginner: 'Mai farawa', downloadOffline: 'Sauke bayanai don amfani offline', verifiedServices: 'Ayyukan da aka tabbatar da mai neman taimako', verifiedServicesSub: 'Jerin UNHCR, taimakon doka, lafiya da gaggawa da aka tabbatar. Koyaushe tabbatar da lokuta.', searchInstitution: 'Nemo cibiya da suna ko wuri...', allInstitutions: 'Dukkan cibiyoyi', catUnhcr: 'UNHCR da UN', catImmigration: 'Shige da fice da fasfo', catHealth: 'Lafiya da asibitocin gaggawa', catLegal: 'NGO na taimakon doka', catPolice: 'Tashoshin ’yan sanda', mapFallbackTitle: 'Jerin ayyukan Cairo da Giza da aka tabbatar', mapFallbackText: 'Yi amfani da katunan don hanyoyin tushe, kira da jagora. An kashe taswirar har sai an saita ainihin Maps key.' },
        om: { daysLabel: 'Guyyaa', lessonsLabel: 'Barnoota', sectionLearn: 'Kutaa A: Afaan Arabaa Gibxii fi aadaa baradhu', sectionLearnSub: 'Karaa barnootaa wal-qunnamtii qabu, shaakala haalaa fi barnoota aadaa qabu.', dailyStreak: 'Walitti fufiinsa guyyaa', totalXp: 'XP waliigalaa', jump: 'Ce’i', progress: 'Guddina', sectionAi: 'Kutaa B: Gargaarsa Saleem', sectionCommunity: 'Kutaa C: Giddugala hawaasaa', sectionProfile: 'Kutaa D: Piroofaayilaa fi tajaajiloota', brandSupport: 'Deeggarsa baqattootaa', localProfile: 'Piroofaayila Saleem naannoo', learningSnapshot: 'Cuunfaa barnootaa', loadingDataset: 'Daataan fe’amaa jira...', privateProgress: 'Tilmaama guddina dhuunfaa meeshaa kanaa fi herrega kee waliin wal-simsiifame.', rank: 'Sadarkaa', learnerName: 'Maqaa barataa', country: 'Biyya', xpPoints: 'Qabxii XP', badge: 'Mallattoo', noLessons: 'Barnoonni hin xumuramne. XP kee jalqabaa argachuuf barnoota 1 xumuri.', mentorHeading: 'Walitti hidhuu gorsitootaa fi deeggarsa fedhii', mentorSub: 'Barattoota sadarkaa ol’aanaa fi fedhiiwwan naannoo afaan kee dubbatan waliin wal qunnami.', weeklyChallenge: 'Qormaata hawaasaa torbanii', weeklyChallengeSub: 'Qormaata Afaan Arabaa Gibxii xumuri, mallattoo Qajeelchaa Qaahiraa argadhu!', requestMentor: 'Gorsaa gaafadhu', discussionFeed: 'Marii hawaasaa', moderatedSafe: 'To’atamaa fi nageenya qabu', reviewHeading: 'Saleem madaali, fooyya’iinsa yaadi', ratingScore: 'Qabxii madaallii:', reviewHelpPlaceholder: 'Akka Saleem Gibxii keessatti si gargaare qoodi...', reviewImprovementPlaceholder: 'Fooyya’iinsa yaadame (filannoo)...', submitFeedback: 'Yaada ergi', communityAverage: 'Madaallii giddu-galeessaa hawaasaa', noPublicReviews: 'Yaadni uummataa hin jiru', feedbackFeed: 'Yaada hawaasaa', localAppProfile: 'Piroofaayila appii naannoo', saleemPass: 'Paasii Saleem', countryOrigin: 'Biyya dhalootaa', saleemUserId: 'Eenyummaa fayyadamaa Saleem', offlineCloud: 'Offline fi cloud waliin wal-simsiifame', editProfile: 'Piroofaayila gulaali', learningMetrics: 'Safartuu barnootaa', wordsLearned: 'Jechoota barataman', phrasesMastered: 'Hima baratame', daysStreak: 'Guyyoota walitti aanan', level: 'Sadarkaa', beginner: 'Jalqabaa', downloadOffline: 'Qabiyyee offline buufadhu', verifiedServices: 'Tajaajiloota mirkanaa’an fi barbaacha gargaarsaa', verifiedServicesSub: 'Tarree UNHCR, gargaarsa seeraa, fayyaa fi hatattamaa mirkanaa’e. Yeroo hojii mirkaneessi.', searchInstitution: 'Dhaabbata maqaa ykn bakka barbaadi...', allInstitutions: 'Dhaabbilee hunda', catUnhcr: 'UNHCR fi UN', catImmigration: 'Immigireeshinii fi paaspoortii', catHealth: 'Fayyaa fi kilinika hatattamaa', catLegal: 'NGO gargaarsa seeraa', catPolice: 'Buufata poolisii', mapFallbackTitle: 'Tarree tajaajiloota Qaahiraa fi Giza mirkanaa’an', mapFallbackText: 'Kaardota fayyadamuun maddoota, bilbila fi kallattii ilaali. Kaartaan keessa jiru hanga furtuun Maps qophaa’utti cufameera.' },
        am: { daysLabel: '\u1240\u1293\u1275', lessonsLabel: '\u1275\u121d\u1205\u122d\u1276\u127d', sectionLearn: '\u12ad\u134d\u120d A: \u12e8\u130d\u133d\u1275 \u12a0\u1228\u1265\u129b \u12a5\u1293 \u1263\u1205\u120d \u12ed\u121b\u1229', sectionLearnSub: '\u12e8\u130d\u133d\u1275 \u12a0\u1228\u1265\u129b \u1309\u12de \u12e8\u1205\u122d\u1235\u1275 \u1309\u12de \u12a5\u1293 \u12e8\u1263\u1205\u120d \u1275\u121d\u1205\u122d\u1276\u127d \u12eb\u1209\u1275\u1362', dailyStreak: '\u12e8\u12a5\u1208\u1275 \u1270\u12a8\u1273\u1273\u120d', totalXp: '\u1320\u1218\u122d XP', jump: '\u12dd\u1218\u1228\u1325', progress: '\u12e8\u12a5\u12e1\u1275 \u12a5\u12e5\u1308\u1263', sectionAi: '\u12ad\u134d\u120d B: \u12e8\u1233\u120a\u121d \u1228\u12f3\u1275', sectionCommunity: '\u12ad\u134d\u120d C: \u12e8\u1230\u1265\u1233\u1260\u1275 \u121b\u12a5\u1240\u120d', sectionProfile: '\u12ad\u134d\u120d D: \u12e8\u1218\u1308\u1208\u132b \u12a5\u1293 \u12a0\u1308\u120d\u130d\u120e\u1276\u127d', brandSupport: '\u12e8\u1263\u1270\u1270\u12a5\u12cd \u12f0\u130b\u134d', localProfile: '\u12e8\u1233\u120a\u121d \u12e8\u12a0\u1298\u1308\u1298\u1265 \u1218\u1308\u1208\u132b', learningSnapshot: '\u12e8\u1218\u121b\u122d \u133d\u1301\u134d', loadingDataset: '\u12f3\u1273 \u1260\u1218\u132b\u1295 \u120b\u12ed \u1290\u12cd...', privateProgress: '\u12a8\u12ad\u134d\u1209 \u12e8\u12a5\u12e1\u1275 \u130d\u1228\u12db \u1218\u1228\u1303 \u1290\u12cd.', rank: '\u12f0\u1228\u1303', learnerName: '\u12e8\u1270\u121b\u122a \u1235\u121d', country: '\u1200\u1308\u122d', xpPoints: '\u12e8 XP \u1290\u1300\u1276\u127d', badge: '\u121d\u120d\u12ad\u1275', noLessons: '\u121d\u1295\u121d \u121d\u12d5\u120b\u1218\u120b\u12e3\u1362 \u12e8\u1218\u1300\u1218\u122a\u12eb \u12f0\u1228\u1303 \u12ed\u1219\u1209\u1362', mentorHeading: '\u12e8\u1218\u122a\u12ab\u12a8\u122d \u12a5\u1293 \u12e8\u12f5\u130b\u134d \u12f5\u130b\u134d', mentorSub: '\u12e8\u12a5\u1235\u12f0\u1275 \u1270\u121b\u122a\u12ce\u127d\u1295 \u12a5\u1293 \u12e8\u1270\u1228\u130b\u1321 \u12a0\u1308\u120d\u130d\u120e\u127d\u1295 \u12eb\u130a\u1299\u1362', weeklyChallenge: '\u12e8\u1233\u121d\u1295\u1275 \u1205\u130d\u12f5', weeklyChallengeSub: '\u12e8\u130d\u133d\u1275 \u12a0\u1228\u1265\u129b \u12e8\u1233\u121d\u1295\u1275 \u1205\u130d\u12f5 \u12ed\u1219\u1209 \u12a5\u1293 \u12e8\u1243\u1205\u122d \u1240\u12f3\u121a \u1218\u1218\u122a\u12eb \u12eb\u130d\u1299\u1362', requestMentor: '\u1218\u122a\u12ab\u12a8\u122d \u12ed\u1300\u121d\u1229', discussionFeed: '\u12e8\u1230\u1265\u1233\u1260\u1275 \u12cd\u12ed\u12ed\u1275', moderatedSafe: '\u12e8\u1270\u1246\u1323\u1320\u1228 \u12a5\u1293 \u12f0\u1205\u1295\u1290\u1270\u129b', reviewHeading: '\u1233\u120a\u121d\u1295 \u12ed\u1218\u12dd\u1291 \u12a5\u1293 \u121b\u123b\u123b\u12eb \u12eb\u1275\u12e9', ratingScore: '\u12e8\u121d\u1308\u1218\u121b \u12cd\u1324\u1275:', reviewHelpPlaceholder: '\u1233\u120a\u121d \u1260\u130d\u133d\u1275 \u12a5\u1295\u12f4\u1275 \u12a5\u1290\u12f0\u1270\u12d5 \u12eb\u130b\u1229...', reviewImprovementPlaceholder: '\u12e8\u1270\u1218\u12a8\u1228\u12f0 \u121b\u123b\u1238\u1235 (\u12a0\u1205\u1273\u121a)...', submitFeedback: '\u130d\u1265\u123d \u12eb\u1235\u1308\u1261', communityAverage: '\u12e8\u1230\u1265\u1233\u1260\u1275 \u12a0\u122b\u1275', noPublicReviews: '\u12e8\u1230\u1265\u1233\u1260\u1275 \u130d\u121d\u130f\u127d \u12a5\u12f2\u1209\u121d', feedbackFeed: '\u12e8\u1230\u1265\u1233\u1260\u1275 \u130d\u121d\u1308\u121b', localAppProfile: '\u12e8\u12a0\u1300\u1263\u1262 \u121b\u1305\u1295 \u1218\u1308\u1208\u132b', saleemPass: '\u1233\u120a\u121d \u1353\u1235', countryOrigin: '\u12e8\u1218\u1323\u1325 \u1200\u1308\u122d', saleemUserId: '\u12e8\u1233\u120a\u121d \u1270\u1320\u1243\u121a \u1218\u1208\u12eb', offlineCloud: '\u12c6\u134b\u120b\u12ed\u1295 \u12a5\u1293 cloud \u1270\u1218\u12f3\u12f0\u1228', editProfile: '\u1218\u1308\u1208\u132b \u12a0\u1235\u1270\u12ab\u12ad', learningMetrics: '\u12e8\u1218\u121b\u122d \u1218\u12c8\u12e8\u12eb\u12ce\u127d', wordsLearned: '\u12e8\u1270\u121b\u1229 \u1243\u120b\u1275', phrasesMastered: '\u12e8\u1270\u121b\u1229 \u1210\u1228\u130e\u127d', daysStreak: '\u12e8\u1240\u1293\u1275 \u1270\u12a8\u1273\u1273\u120d', level: '\u12f0\u1228\u1303', beginner: '\u1307\u1205\u120d', downloadOffline: '\u12f3\u1273 \u1218\u1290\u1218\u1290\u127d \u1260\u12e6\u134b\u120b\u12ed \u1270\u12c4\u120b\u12ed', verifiedServices: '\u12e8\u1270\u1228\u130b\u1321 \u12a0\u1308\u120d\u130d\u120e\u1276\u127d \u12a5\u1293 \u12e8\u1203\u122c \u1218\u1348\u130a\u12eb', verifiedServicesSub: '\u12e8UNHCR \u12a8\u12a5\u1293 \u12e8\u1205\u130d \u12f5\u130b\u134d\u1363 \u130d\u1265\u133d \u12a5\u1293 \u12e8\u12a0\u12a8\u1263\u1262 \u12a0\u1308\u120d\u130d\u120e\u1276\u127d \u12f3\u130d\u1219\u1362', searchInstitution: '\u12a2\u1295\u1235\u1272\u1275\u12e9\u123d\u1295 \u1260\u1235\u121d \u12c8\u12ed\u121d \u1260\u1266\u1273 \u12f7\u130b', allInstitutions: '\u1201\u1209\u121d \u12a2\u1295\u1235\u1272\u1275\u12e0e\u127d', catUnhcr: 'UNHCR & UN', catImmigration: '\u12a2\u121a\u130d\u122c\u123d\u1295 \u12a5\u1293  passport', catHealth: '\u130d\u133d\u1275 \u12a5\u1293 \u12a0\u12a8\u1263\u1262', catLegal: '\u12e8\u1215\u130d \u12f5\u130b\u134d NGOs', catPolice: '\u12e8\u1356\u120a\u1235 \u1303\u1276\u127d', mapFallbackTitle: '\u12e8\u12a0\u12f2\u1235 \u12a0\u1260\u1263 \u1240\u1275\u122d \u12a5\u1293 \u1308\u12e8\u12a4\u12dd\u12a5 \u12e8\u1270\u1228\u130b\u1321 \u12a0\u1308\u120d\u130d\u120e\u1276\u127d', mapFallbackText: '\u1218\u1300\u1218\u122a\u12eb\u12ce\u127d\u1295 \u12a5\u1293 \u12a0\u1245\u1323\u132b\u12ce\u127d\u1295 \u1208\u121b\u12e8\u1275 \u12a8\u1273\u127d \u12ed\u1320\u1240\u1219\u1362' },
        ti: { daysLabel: '\u1218\u12d3\u120d\u1272', lessonsLabel: '\u1275\u121d\u1205\u122d\u1272', sectionLearn: '\u12ad\u134d\u120d A: \u130d\u1265\u133a \u12d3\u1228\u1265\u129b \u12a5\u1293 \u1263\u1215\u120a \u121d\u1213\u122d', sectionLearnSub: '\u12dd\u1270\u12f3\u1208\u12e8 \u130d\u1265\u133a \u12d3\u1228\u1265\u129b \u1218\u1300\u1218\u122a\u12eb \u12a5\u1293 \u1263\u1215\u120a \u1275\u121d\u1205\u122d\u1272\u1362', dailyStreak: '\u12dd\u12d5\u12cd\u1270\u1290 \u1218\u12d3\u120d\u1272', totalXp: '\u1320\u121d\u1229 XP', jump: '\u12f5\u1208\u12ed', progress: '\u12dd\u1260\u133d\u1200 \u121d\u1295\u1263\u122d', sectionAi: '\u12ad\u134d\u120d B: \u1233\u120a\u121d AI', sectionCommunity: '\u12ad\u134d\u120d C: \u121b\u1205\u1260\u1228\u1230\u1265\u1233\u1260\u1275', sectionProfile: '\u12ad\u134d\u120d D: \u1218\u1308\u1208\u1325\u1295 \u12a0\u1308\u120d\u130d\u120e\u1275\u1295', brandSupport: '\u12f0\u130b\u134d \u1263\u1240\u122d\u1262', localProfile: '\u121e\u1323\u122a\u12e8 Saleem \u1218\u1308\u1208\u132b', learningSnapshot: '\u1230\u121e\u1295\u1275 \u1275\u121d\u1205\u122d\u1272', loadingDataset: '\u12f3\u1273 \u12ed\u132b\u129b\u120d', privateProgress: '\u12e8\u121b\u1201\u1275 \u130d\u1228\u12db \u130d\u1295\u12e1', rank: '\u12f0\u1228\u1303', learnerName: '\u1235\u121d \u1270\u121b\u122a', country: '\u1203\u1308\u122d', xpPoints: '\u12e8 XP \u1290\u1300\u1276\u127d', badge: '\u121d\u120d\u12ad\u1275', noLessons: '\u121d\u1295\u121d \u12f0\u122d\u1235 \u12a0\u120d\u1328\u1261\u121d', mentorHeading: '\u12a0\u1233\u1233\u1262 \u1218\u130b\u1300\u1265\u1295 \u12f0\u130b\u134d', mentorSub: '\u121d\u1235 \u12f0\u1240\u1245\u1260 \u1270\u121b\u122e\u127d \u12a5\u1293 \u1270\u1228\u130b\u1321 \u1263\u1208\u1219\u12eb\u1275 \u1215\u1265\u1228\u1275', weeklyChallenge: '\u1230\u1219\u1295\u1273\u12ca \u1270\u130d\u1263\u122d', weeklyChallengeSub: '\u12dd\u12c8\u12f3\u12f0 \u130d\u1265\u133a \u12d3\u1228\u1265\u129b \u1270\u130d\u1263\u122d \u12f5\u1208\u12ed\u1362', requestMentor: '\u1213\u1308\u12db \u12f5\u1208\u12ed', discussionFeed: '\u121b\u1215\u1260\u122b\u12ca \u12dd\u122d\u122d\u1265', moderatedSafe: '\u1265\u1265\u1215\u1275 \u12dd\u121d\u122d\u1213\u12a5', reviewHeading: '\u1233\u120a\u121d \u121d\u12f0\u12dd\u1295 \u121b\u123b\u123b\u12eb \u12a3\u1245\u122d\u1265', ratingScore: '\u12cd\u1325\u1295 \u121d\u130d\u121b\u1215', reviewHelpPlaceholder: '\u1233\u120a\u121d \u1265\u130d\u1265\u133a \u12a8\u121d\u1295\u1275\u12f5\u12a9 \u12a3\u1242\u1362', reviewImprovementPlaceholder: '\u121d\u12f5\u12b3\u121d \u12dd\u1260\u1208\u1338 (\u1215\u12f0\u1228\u1275)...', submitFeedback: '\u12a3\u1233\u12f0\u12f3 \u1218\u120d\u12e1', communityAverage: '\u121b\u12d3\u1228\u12f3 \u1265\u1265\u1215\u1275', noPublicReviews: '\u1213\u1295\u1272 \u1213\u1260\u122c\u1273 \u12e8\u120d\u1266\u1295', feedbackFeed: '\u1213\u1260\u122c\u1273 \u121b\u1205\u1260\u122b', localAppProfile: '\u121e\u1323\u122a\u12e8 app \u1218\u1308\u1208\u132b', saleemPass: '\u1233\u120a\u121d Pass', countryOrigin: '\u1203\u1308\u122d \u1218\u1295\u130e\u122d', saleemUserId: '\u12a5\u1301 \u1218\u1208\u12eb Saleem', offlineCloud: '\u12a8\u12f5\u130b\u134d \u12cd\u12ed\u121d cloud \u1270\u1218\u12f3\u12f0\u1228', editProfile: '\u1218\u1308\u1208\u132b \u121b\u1235\u1270\u12ab\u12a8\u12eb', learningMetrics: '\u12e8\u1218\u121b\u122d \u1218\u12c8\u12e8\u12eb', wordsLearned: '\u12e8\u1270\u121b\u1229 \u1243\u120b\u1275', phrasesMastered: '\u12e8\u1270\u121b\u1229 \u1210\u1228\u130e\u127d', daysStreak: '\u12e8\u1240\u1293\u1275 \u1270\u12a8\u1273\u1273\u120d', level: '\u12f0\u1228\u1303', beginner: '\u1307\u1205\u120d', downloadOffline: '\u12f3\u1273 \u1260\u12e6\u134b\u120b\u12ed \u1270\u12ac\u12f0\u12a8', verifiedServices: '\u12e8\u1270\u1228\u130b\u1321 \u12a0\u1308\u120d\u130d\u120e\u1275', verifiedServicesSub: '\u12e8UNHCR \u12d5\u12f3 \u12e8\u1215\u130d \u12f5\u130b\u134d \u12a5\u1293 \u12e8\u130d\u1265\u133d \u12a0\u1308\u120d\u130d\u120e\u1275 \u12a0\u1208\u1362', searchInstitution: '\u12a2\u1295\u1235\u1272\u1275\u12df\u12cd\u1295 \u1260\u1235\u121d \u12c8\u12ed\u121d \u1260\u1266\u1273 \u12ed\u121e\u1219', allInstitutions: '\u1201\u1209\u121d \u12a2\u1295\u1235\u1272\u1276\u127d', catUnhcr: 'UNHCR & UN', catImmigration: '\u12a2\u121a\u130d\u122c\u123d\u1295 \u12a5\u1293 \u12e8\u12a0\u120b\u134b \u1218\u12d8\u12eb', catHealth: '\u130d\u1265\u133d \u12a5\u1293 \u12a0\u12a8\u1263\u1262', catLegal: '\u12e8\u1205\u130d \u12f5\u130b\u134d', catPolice: '\u12e8\u1356\u120a\u1235 \u1303\u1276\u127d', mapFallbackTitle: '\u12e8\u12ab\u1205\u122d \u12a5\u1293 \u130a\u12db \u12e8\u1270\u1228\u130b\u1321 \u12a0\u1308\u120d\u130d\u120e\u1275', mapFallbackText: '\u121d\u12ad\u12d5\u1276\u127d\u1295 \u12a5\u1293 \u12a0\u1245\u1323\u132b\u12ce\u127d\u1295 \u1218\u12a8\u1270\u120d \u12d5\u12f0\u122d\u1362' }
    });

    const APP_ACTION_TEXT = Object.freeze({
        en: { translate: 'Translate', translating: 'Translating...', sourceChecked: 'Source checked', officialSource: 'Official source', call: 'Call Direct', directions: 'Directions', usefulPhrase: 'Useful Phrase to Say', requiredDocs: 'Required Documents', replies: 'Answers / Replies', visible: 'Visible to Everyone' },
        ar: { translate: '\u062a\u0631\u062c\u0645\u0629', translating: '\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u0631\u062c\u0645\u0629...', sourceChecked: '\u062a\u0645 \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0635\u062f\u0631', officialSource: '\u0627\u0644\u0645\u0635\u062f\u0631 \u0627\u0644\u0631\u0633\u0645\u064a', call: '\u0627\u062a\u0635\u0627\u0644 \u0645\u0628\u0627\u0634\u0631', directions: '\u0627\u0644\u0627\u062a\u062c\u0627\u0647\u0627\u062a', usefulPhrase: '\u0639\u0628\u0627\u0631\u0629 \u0645\u0635\u0631\u064a\u0629 \u0645\u0641\u064a\u062f\u0629', requiredDocs: '\u0627\u0644\u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629', replies: '\u0627\u0644\u0631\u062f\u0648\u062f', visible: '\u0645\u0631\u0626\u064a \u0644\u0644\u062c\u0645\u064a\u0639' },
        fr: { translate: 'Traduire', translating: 'Traduction en cours...', sourceChecked: 'Source vérifiée', officialSource: 'Source officielle', call: 'Appeler', directions: 'Itinéraire', usefulPhrase: 'Phrase utile à dire', requiredDocs: 'Documents requis', replies: 'Réponses', visible: 'Visible par tous' },
        so: { translate: 'Turjun', translating: 'Turjumaad socota...', sourceChecked: 'Isha waa la hubiyay', officialSource: 'Isha rasmiga ah', call: 'Wac toos', directions: 'Tilmaamo', usefulPhrase: 'Weedh waxtar leh', requiredDocs: 'Dukumentiyada loo baahan yahay', replies: 'Jawaabo', visible: 'Qof walba wuu arki karaa' },
        ti: { translate: 'ተርጉም', translating: 'ትርጉም ይካየድ ኣሎ...', sourceChecked: 'ምንጪ ተረጋጊጹ', officialSource: 'ወግዓዊ ምንጪ', call: 'ቀጥታ ደውል', directions: 'ኣንፈት', usefulPhrase: 'ጠቓሚ ሓረግ', requiredDocs: 'ዘድልዩ ሰነዳት', replies: 'መልስታት', visible: 'ንኹሉ ይርአ' },
        sw: { translate: 'Tafsiri', translating: 'Inatafsiriwa...', sourceChecked: 'Chanzo kimethibitishwa', officialSource: 'Chanzo rasmi', call: 'Piga simu moja kwa moja', directions: 'Maelekezo', usefulPhrase: 'Maneno muhimu ya kusema', requiredDocs: 'Nyaraka zinazohitajika', replies: 'Majibu', visible: 'Inaonekana kwa wote' },
        ha: { translate: 'Fassara', translating: 'Ana fassara...', sourceChecked: 'An tabbatar da tushe', officialSource: 'Tushen hukuma', call: 'Kira kai tsaye', directions: 'Hanyoyi', usefulPhrase: 'Jimla mai amfani', requiredDocs: 'Takardun da ake bukata', replies: 'Amsoshi', visible: 'Kowa zai gani' },
        om: { translate: 'Hiiki', translating: 'Hiikamaa jira...', sourceChecked: 'Maddi mirkanaa’e', officialSource: 'Maddi mootummaa', call: 'Kallattiin bilbili', directions: 'Kallattii', usefulPhrase: 'Jechoota faayidaa qaban', requiredDocs: 'Sanadoota barbaachisan', replies: 'Deebiiwwan', visible: 'Hundaaf mul’ata' }
    });

    function getAppActionText(key, lang = getSelectedLanguage()) {
        return APP_ACTION_TEXT[lang]?.[key] || APP_ACTION_TEXT.en[key] || '';
    }

    const LEARNING_UI_TEXT = Object.freeze({
        en: { trackDialect: 'Track 1: Learn Egyptian Dialect', trackCulture: 'Track 2: Learn Egyptian Culture', datasetAvailable: 'Dataset available', datasetUnavailable: 'Dataset unavailable', unavailable: 'Unavailable', progressionDialect: 'Egyptian Dialect Progression', progressionCulture: 'Egyptian Culture Progression', lessons: 'Lessons', lesson: 'Lesson' },
        ar: { trackDialect: '\u0627\u0644\u0645\u0633\u0627\u0631 1: \u062a\u0639\u0644\u0645 \u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629', trackCulture: '\u0627\u0644\u0645\u0633\u0627\u0631 2: \u062a\u0639\u0644\u0645 \u0627\u0644\u062b\u0642\u0627\u0641\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629', datasetAvailable: '\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0645\u062a\u0627\u062d\u0629', datasetUnavailable: '\u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629', unavailable: '\u063a\u064a\u0631 \u0645\u062a\u0627\u062d', progressionDialect: '\u0645\u0633\u0627\u0631 \u0627\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629', progressionCulture: '\u0645\u0633\u0627\u0631 \u0627\u0644\u062b\u0642\u0627\u0641\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629', lessons: '\u062f\u0631\u0648\u0633', lesson: '\u0627\u0644\u062f\u0631\u0633' },
        am: { trackDialect: 'መስመር 1: የግብፅ አረብኛ ተማር', trackCulture: 'መስመር 2: የግብፅ ባህል ተማር', datasetAvailable: 'መረጃው ይገኛል', datasetUnavailable: 'መረጃው አይገኝም', unavailable: 'አይገኝም', progressionDialect: 'የግብፅ አረብኛ እድገት', progressionCulture: 'የግብፅ ባህል እድገት', lessons: 'ትምህርቶች', lesson: 'ትምህርት' },
        fr: { trackDialect: 'Parcours 1 : apprendre l’arabe égyptien', trackCulture: 'Parcours 2 : apprendre la culture égyptienne', datasetAvailable: 'Données disponibles', datasetUnavailable: 'Données indisponibles', unavailable: 'Indisponible', progressionDialect: 'Parcours d’arabe égyptien', progressionCulture: 'Parcours de culture égyptienne', lessons: 'leçons', lesson: 'Leçon' },
        so: { trackDialect: 'Jidka 1: Baro Carabiga Masar', trackCulture: 'Jidka 2: Baro dhaqanka Masar', datasetAvailable: 'Xogtu waa diyaar', datasetUnavailable: 'Xogtu ma jirto', unavailable: 'Lama heli karo', progressionDialect: 'Horumarka Carabiga Masar', progressionCulture: 'Horumarka dhaqanka Masar', lessons: 'casharro', lesson: 'Cashar' },
        ti: { trackDialect: 'መስመር 1: ግብጺ ዓረብኛ ተማሃር', trackCulture: 'መስመር 2: ባህሊ ግብጺ ተማሃር', datasetAvailable: 'ዳታ ኣሎ', datasetUnavailable: 'ዳታ የለን', unavailable: 'የለን', progressionDialect: 'ምዕባለ ግብጺ ዓረብኛ', progressionCulture: 'ምዕባለ ባህሊ ግብጺ', lessons: 'ትምህርቲ', lesson: 'ትምህርቲ' },
        sw: { trackDialect: 'Njia 1: Jifunze Kiarabu cha Misri', trackCulture: 'Njia 2: Jifunze utamaduni wa Misri', datasetAvailable: 'Data inapatikana', datasetUnavailable: 'Data haipatikani', unavailable: 'Haipatikani', progressionDialect: 'Maendeleo ya Kiarabu cha Misri', progressionCulture: 'Maendeleo ya utamaduni wa Misri', lessons: 'masomo', lesson: 'Somo' },
        ha: { trackDialect: 'Hanya ta 1: Koyi Larabcin Masar', trackCulture: 'Hanya ta 2: Koyi al adun Masar', datasetAvailable: 'Bayanai suna nan', datasetUnavailable: 'Ba a samun bayanai', unavailable: 'Ba a samu ba', progressionDialect: 'Ci gaban Larabcin Masar', progressionCulture: 'Ci gaban al adun Masar', lessons: 'darussa', lesson: 'Darasi' },
        om: { trackDialect: 'Karaa 1: Afaan Arabaa Gibxii baradhu', trackCulture: 'Karaa 2: Aadaa Gibxii baradhu', datasetAvailable: 'Daataan jira', datasetUnavailable: 'Daataan hin jiru', unavailable: 'Hin argamu', progressionDialect: 'Guddina Afaan Arabaa Gibxii', progressionCulture: 'Guddina aadaa Gibxii', lessons: 'barnoota', lesson: 'Barnoota' }
    });

    function getLearningUiText(key, lang = getSelectedLanguage()) {
        return LEARNING_UI_TEXT[lang]?.[key] || LEARNING_UI_TEXT.en[key] || '';
    }

    let activeUiLanguage = 'en';

    function normalizeLanguage(lang) {
        return LANGUAGE_METADATA[lang] ? lang : 'en';
    }

    function getSelectedLanguage() {
        return normalizeLanguage(activeUiLanguage || localStorage.getItem('saleem_ui_lang') || localStorage.getItem('saleem_user_language') || 'en');
    }

    function getLanguageRuntimeText(key, lang = getSelectedLanguage()) {
        const serviceKeys = { serviceFindHelp: 'find', serviceChooseArea: 'area', serviceSearchArea: 'search', servicePermission: 'permission', serviceLocationDenied: 'denied', serviceGpsUnavailable: 'unavailable', serviceNoResults: 'empty', serviceGovernorate: 'governorate', serviceCity: 'city', serviceSort: 'sort', serviceNearest: 'nearest', serviceBestMatch: 'best', serviceRecentlyVerified: 'recent' };
        if (serviceKeys[key]) return SERVICE_RUNTIME_TEXT[lang]?.[serviceKeys[key]] || SERVICE_RUNTIME_TEXT.ar[serviceKeys[key]];
        if (LEARNING_UI_TEXT[lang]?.[key]) return LEARNING_UI_TEXT[lang][key];
        return APP_SHELL_TEXT[lang]?.[key] || CHAT_UI_TEXT[lang]?.[key] || PREMIUM_UI_OVERRIDES[lang]?.[key] || PREMIUM_UI_TEXT[lang]?.[key] || LANGUAGE_RUNTIME_TEXT[lang]?.[key] || APP_SHELL_TEXT.ar[key] || CHAT_UI_TEXT.ar[key] || PREMIUM_UI_TEXT.ar[key] || LANGUAGE_RUNTIME_TEXT.ar[key] || '';
    }

    function getUiTranslation(key, lang = getSelectedLanguage()) {
        if (key === 'hdr-translator-sub') {
            return APP_SHELL_TEXT[lang]?.translatorPair || LANGUAGE_RUNTIME_TEXT[lang]?.translatorPair || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en.translatorPair : getLanguageRuntimeText('egyptianArabicOnly', lang));
        }
        if (key === 'hdr-assistant-sub') {
            return APP_SHELL_TEXT[lang]?.assistantPair || LANGUAGE_RUNTIME_TEXT[lang]?.assistantPair || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en.assistantPair : getLanguageRuntimeText('egyptianArabicOnly', lang));
        }
        if (['brandSupport', 'localProfile', 'learningSnapshot'].includes(key)) {
            return APP_SHELL_TEXT[lang]?.[key] || LANGUAGE_RUNTIME_TEXT[lang]?.[key] || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en[key] : getLanguageRuntimeText('egyptianArabicOnly', lang));
        }
        const selectedDict = i18n[lang] || {};
        const alias = UI_I18N_ALIASES[key];
        return selectedDict[key]
            || (alias && selectedDict[alias])
            || APP_SHELL_TEXT[lang]?.[key]
            || CHAT_UI_TEXT[lang]?.[key]
            || PREMIUM_UI_OVERRIDES[lang]?.[key]
            || PREMIUM_UI_TEXT[lang]?.[key]
            || LANGUAGE_RUNTIME_TEXT[lang]?.[key]
            || APP_SHELL_TEXT[lang]?.[key]
            || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en[key] : APP_SHELL_TEXT.ar[key] || LANGUAGE_RUNTIME_TEXT.ar[key])
            || '';
    }

    const uiLangSwitcher = document.getElementById('ui-lang-switcher');

    function showLanguageCoverageNotice(lang) {
        let notice = document.getElementById('language-coverage-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'language-coverage-notice';
            notice.setAttribute('role', 'status');
            notice.style.cssText = 'margin:0 0 14px;padding:10px 14px;border:1px solid var(--warm-sand);border-radius:10px;color:var(--warm-sand);font-size:12px;line-height:1.5;';
            document.querySelector('.content-container')?.prepend(notice);
        }
        notice.textContent = lang === 'en' ? '' : getLanguageRuntimeText('coverageNotice', lang);
        notice.style.display = lang === 'en' ? 'none' : 'block';
    }

    function persistPreferredLanguage(lang, syncRemote = true) {
        const normalized = normalizeLanguage(lang);
        activeUiLanguage = normalized;
        localStorage.setItem('saleem_ui_lang', normalized);
        localStorage.setItem('saleem_user_language', normalized);
        localStorage.setItem('saleem_app_language', normalized);

        if (syncRemote && API.getToken()) {
            API.fetch('/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({ preferred_language: normalized })
            }).catch(() => {});
        }
        return normalized;
    }

    function setUiLanguage(lang, options = {}) {
        const normalized = persistPreferredLanguage(lang, options.syncRemote !== false);
        const selectedDict = i18n[normalized] || {};
        const direction = LANGUAGE_METADATA[normalized].dir;
        document.documentElement.setAttribute('lang', normalized);
        document.documentElement.setAttribute('dir', direction);
        document.body?.setAttribute('data-primary-language', normalized);
        document.body?.setAttribute('data-local-language', 'ar-EG');

        const landingAppPreview = document.querySelector('.app-screen-shot');
        if (landingAppPreview) {
            const previewSuffix = normalized === 'en' ? '' : `-${normalized}`;
            landingAppPreview.src = `assets/saleem-app-first-open${previewSuffix}.png`;
        }

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const value = getUiTranslation(key, normalized);
            const span = el.querySelector('span');
            if (value && span) span.textContent = value;
            else if (value) {
                const icon = el.querySelector('i');
                if (icon) {
                    el.replaceChildren(icon, document.createTextNode(` ${value}`));
                } else {
                    el.textContent = value;
                }
            }
            else el.setAttribute('data-translation-missing', 'true');
        });

        document.querySelectorAll('[data-i18n-ph]').forEach(el => {
            const key = el.getAttribute('data-i18n-ph');
            const value = getUiTranslation(key, normalized);
            if (value) el.setAttribute('placeholder', value);
            else el.setAttribute('data-translation-missing', 'true');
        });

        const sourceLangSelect = document.getElementById('source-lang');
        if (sourceLangSelect) sourceLangSelect.value = normalized;
        const targetLangSelect = document.getElementById('target-lang');
        if (targetLangSelect) targetLangSelect.value = 'ar_eg';
        if (uiLangSwitcher) uiLangSwitcher.value = normalized;

        showLanguageCoverageNotice(normalized);

        try {
            if (typeof renderDailyPhrasesUI === 'function') renderDailyPhrasesUI();
        } catch (e) { /* optional legacy module */ }
        window.setTimeout(() => {
            if (typeof renderDuolingoSnakePath === 'function') renderDuolingoSnakePath();
            if (typeof updateLocalLearningStats === 'function') updateLocalLearningStats();
            if (document.getElementById('institutions-directory-grid')) {
                if (typeof renderInstitutionsDirectoryUI === 'function') renderInstitutionsDirectoryUI('all', '');
            }
        }, 0);
    }

    // -------------------------------------------------------------
    // 3. FIRST-TIME USER NAME & NATIONALITY ONBOARDING MODAL
    // -------------------------------------------------------------
    async function checkFirstTimeOnboarding() {
        const savedName = localStorage.getItem('saleem_user_name');
        const savedNationality = localStorage.getItem('saleem_user_nationality');

        if (!savedName || !savedNationality) {
            showOnboardingModal();
        } else {
            const currentUserId = localStorage.getItem('saleem_user_id') || localStorage.getItem('saleem_supabase_uid');
            updateUserProfileUI(savedName, savedNationality, currentUserId);

            // --- Legacy identity migration & Auth alignment ---
            const legacyId = localStorage.getItem('saleem_user_id');
            const alreadyMigrated = localStorage.getItem('anonymous_auth_identity_migration_v1');

            // Trigger migration if not completed yet, or if current user_id is legacy ID (e.g. SLM-XXXX)
            if (!alreadyMigrated && legacyId) {
                try {
                    const authResult = await ensureAuthenticatedUser();
                    if (authResult.source === 'supabase') {
                        if (authResult.uid !== legacyId) {
                            console.log('Migrating legacy identity to Supabase Auth UUID:', legacyId, '->', authResult.uid);
                            const res = await API.fetch('/auth/migrate-identity', {
                                method: 'POST',
                                body: JSON.stringify({ old_user_id: legacyId, new_user_id: authResult.uid })
                            });
                            if (res.token) {
                                API.setToken(res.token);
                                localStorage.setItem('saleem_user_id', authResult.uid);
                                localStorage.setItem('saleem_supabase_uid', authResult.uid);
                                localStorage.setItem('anonymous_auth_identity_migration_v1', new Date().toISOString());
                                updateUserProfileUI(savedName, savedNationality, authResult.uid);
                                console.log('Identity migration complete. public.users.id is now:', authResult.uid);
                            }
                        } else {
                            // User already aligned with Supabase UUID
                            localStorage.setItem('anonymous_auth_identity_migration_v1', new Date().toISOString());
                        }
                    }
                } catch (e) {
                    console.warn('Legacy identity migration deferred (will retry with same Auth session):', e.message);
                }
            }
        }
    }

    function showOnboardingModal() {
        const existing = document.getElementById('user-onboarding-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'user-onboarding-modal';
        modal.style.position = 'fixed';
        modal.style.inset = '0';
        modal.style.background = 'rgba(11, 18, 32, 0.96)';
        modal.style.backdropFilter = 'blur(20px)';
        modal.style.zIndex = '9999';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.padding = '20px';
        modal.style.overflowY = 'auto';

        let selectedNationality = '';
        let selectedLanguage = normalizeLanguage(localStorage.getItem('saleem_ui_lang') || 'en');
        let languageWasExplicitlySelected = false;

        modal.innerHTML = `
            <div class="card" style="width: 100%; max-width: 500px; padding: 28px 24px; text-align: center; border: 1px solid var(--warm-sand); box-shadow: 0 20px 50px rgba(0,0,0,0.6); background: var(--surface-dark); border-radius: 20px;">
                <div style="width:54px; height:54px; background:var(--warm-sand); border-radius:16px; display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto; font-size:26px; color:var(--nile-dark);">
                    <i class="fa-solid fa-earth-africa"></i>
                </div>

                <h2 id="onboard-title" style="font-size:22px; font-weight:800; color:#fff; margin-bottom:6px;">Step 1: Select Your Country of Origin</h2>
                <p id="onboard-sub" style="color:var(--text-muted); font-size:13px; margin-bottom:18px; line-height:1.5;">
                    Choose your country first. The app will automatically adapt to your native language!
                </p>

                <div style="margin-bottom:16px; text-align:left;">
                    <label style="font-size:12px; color:var(--warm-sand); font-weight:600; display:block; margin-bottom:6px; text-transform:uppercase;">Choose your app language:</label>
                    <select id="onboarding-language-select" class="form-control" style="font-size:14px; padding:10px; border-radius:10px; background:var(--bg-dark); border:1px solid var(--glass-border); color:#fff; width:100%;">
                        <option value="en">English</option>
                        <option value="ar">Egyptian Arabic</option>
                        <option value="am">Amharic</option>
                        <option value="so">Somali</option>
                        <option value="fr">French</option>
                        <option value="ti">Tigrinya</option>
                        <option value="sw">Swahili</option>
                        <option value="ha">Hausa</option>
                        <option value="om">Oromo</option>
                    </select>
                </div>

                <!-- Welcome Banner (appears after country selection) -->
                <div id="onboard-welcome-banner" style="display:none; padding:12px; background:rgba(16, 185, 129, 0.15); border:1px solid var(--emerald); border-radius:12px; margin-bottom:16px; color:var(--emerald); font-weight:600; font-size:14px;">
                    <i class="fa-solid fa-heart"></i> <span id="welcome-msg-text">Welcome to Saleem!</span>
                </div>

                <!-- Country Grid -->
                <div id="country-select-section" style="margin-bottom:16px;">
                    <label style="font-size:12px; color:var(--warm-sand); font-weight:600; display:block; margin-bottom:10px; text-align:left; text-transform:uppercase; letter-spacing:0.5px;">Select Country (Required *):</label>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <button class="nat-btn btn btn-outline" data-nat="Sudan" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇸🇩 Sudan</button>
                        <button class="nat-btn btn btn-outline" data-nat="Ethiopia" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇪🇹 Ethiopia</button>
                        <button class="nat-btn btn btn-outline" data-nat="Somalia" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇸🇴 Somalia</button>
                        <button class="nat-btn btn btn-outline" data-nat="Eritrea" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇪🇷 Eritrea</button>
                        <button class="nat-btn btn btn-outline" data-nat="Kenya" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇰🇪 Kenya / Tz</button>
                        <button class="nat-btn btn btn-outline" data-nat="Nigeria" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇳🇬 Nigeria</button>
                        <button class="nat-btn btn btn-outline" data-nat="DR Congo" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇨🇩 DR Congo</button>
                        <button class="nat-btn btn btn-outline" data-nat="Syria" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇸🇾 Syria</button>
                        <button class="nat-btn btn btn-outline" data-nat="Egypt" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🇪🇬 Egypt</button>
                        <button class="nat-btn btn btn-outline" data-nat="Other" style="justify-content:flex-start; padding:10px 12px; font-size:13px;">🌐 Other Country</button>
                    </div>
                </div>

                <!-- Custom Country Input (if Other selected) -->
                <div id="custom-country-container" style="display:none; margin-bottom:16px; text-align:left;">
                    <label style="font-size:12px; color:var(--warm-sand); font-weight:600; display:block; margin-bottom:6px; text-transform:uppercase;">Write Your Country Name (Required *):</label>
                    <input type="text" id="onboarding-custom-country" placeholder="Enter country name..." class="form-control" style="font-size:14px; padding:10px; border-radius:10px; background:var(--bg-dark); border:1px solid var(--glass-border); color:#fff; width:100%;">
                </div>

                <!-- Name Input Section -->
                <div id="name-input-section" style="margin-bottom:20px; text-align:left;">
                    <label id="onboard-name-label" style="font-size:12px; color:var(--warm-sand); font-weight:600; display:block; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">Enter Your Full Name (Required *):</label>
                    <input type="text" id="onboarding-user-name" placeholder="Enter full name (e.g. Amina Hassan)" class="form-control" style="font-size:14px; padding:12px; border-radius:10px; background:var(--bg-dark); border:1px solid var(--glass-border); color:#fff; width:100%;">
                </div>

                <button class="btn btn-primary" id="btn-finish-onboarding" style="width:100%; justify-content:center; padding:12px; font-size:15px;"><i class="fa-solid fa-arrow-right-to-bracket"></i> Save & Enter Saleem Dashboard</button>

                <p style="font-size:11px; color:var(--emerald); margin-top:12px;"><i class="fa-solid fa-shield-check"></i> Both Name & Country Are Required • Saved Permanently</p>
            </div>
        `;

        document.body.appendChild(modal);
        const onboardingLanguageSelect = document.getElementById('onboarding-language-select');
        if (onboardingLanguageSelect) {
            onboardingLanguageSelect.value = selectedLanguage;
            onboardingLanguageSelect.addEventListener('change', event => {
                selectedLanguage = normalizeLanguage(event.target.value);
                languageWasExplicitlySelected = true;
                setUiLanguage(selectedLanguage, { syncRemote: false });
            });
        }

        const welcomeGreetings = {
            Sudan: "أهلاً وسهلاً بك في تطبيق سليم! 🇸🇩",
            Egypt: "أهلاً بيك في سليم! 🇪🇬",
            Syria: "أهلاً وسهلاً بك في سليم! 🇸🇾",
            Ethiopia: "እንኳን በደህና መጡ! 🇪🇹",
            Somalia: "Ku soo dhawaaw Saleem! 🇸🇴",
            Eritrea: "እንቋዕ ብደሓን መጻእኻ! 🇪🇷",
            Kenya: "Karibu sana Saleem! 🇰🇪",
            Nigeria: "Sannu da zuwa Saleem! 🇳🇬",
            "DR Congo": "Bienvenue sur Saleem! 🇨🇩",
            Other: "Welcome to Saleem! 🌐"
        };

        modal.querySelectorAll('.nat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.nat-btn').forEach(b => b.style.borderColor = 'transparent');
                btn.style.borderColor = 'var(--warm-sand)';
                btn.style.background = 'rgba(232, 171, 99, 0.2)';

                selectedNationality = btn.getAttribute('data-nat');

                const customContainer = document.getElementById('custom-country-container');
                if (selectedNationality === 'Other') {
                    if (customContainer) customContainer.style.display = 'block';
                } else {
                    if (customContainer) customContainer.style.display = 'none';
                }

                // Auto-switch entire UI language instantly!
                const mapping = nationalityMap[selectedNationality] || nationalityMap["Other"];
                if (!languageWasExplicitlySelected) selectedLanguage = mapping.lang;
                if (onboardingLanguageSelect) onboardingLanguageSelect.value = selectedLanguage;
                if (uiLangSwitcher) uiLangSwitcher.value = selectedLanguage;
                setUiLanguage(selectedLanguage, { syncRemote: false });

                // Show welcome greeting banner in selected language
                const welcomeBanner = document.getElementById('onboard-welcome-banner');
                const welcomeText = document.getElementById('welcome-msg-text');
                if (welcomeBanner && welcomeText) {
                    welcomeText.textContent = welcomeGreetings[selectedNationality] || welcomeGreetings.Other;
                    welcomeBanner.style.display = 'block';
                }
            });
        });

        const btnFinish = document.getElementById('btn-finish-onboarding');
        if (btnFinish) {
            btnFinish.addEventListener('click', () => {
                const nameInput = document.getElementById('onboarding-user-name');
                const rawName = nameInput ? nameInput.value.trim() : '';

                let finalCountry = selectedNationality;
                if (selectedNationality === 'Other') {
                    const customInput = document.getElementById('onboarding-custom-country');
                    finalCountry = customInput ? customInput.value.trim() : '';
                }

                if (!selectedNationality) {
                    alert('Please select your Country of Origin.');
                    return;
                }

                if (!finalCountry) {
                    alert('Please write your Country Name.');
                    return;
                }

                if (!rawName) {
                    alert('Please enter your Full Name.');
                    return;
                }

                applyUserData(rawName, finalCountry, selectedLanguage);
                modal.remove();
            });
        }
    }

    async function applyUserData(userName, nationality, preferredLanguage) {
        const mapping = nationalityMap[nationality] || nationalityMap["Other"];
        const selectedLanguage = normalizeLanguage(preferredLanguage || mapping.lang);
        
        // Generate or retrieve unique Saleem Digital Pass User ID
        // Get Supabase Auth UUID or fall back to legacy local ID
        const authResult = await ensureAuthenticatedUser();
        let userId = authResult.uid;
        localStorage.setItem('saleem_user_id', userId);
        if (authResult.source === 'supabase') {
            localStorage.setItem('saleem_supabase_uid', userId);
        }

        // 1. Permanent Local Storage Persistence
        localStorage.setItem('saleem_user_name', userName);
        localStorage.setItem('saleem_user_nationality', nationality);
        localStorage.setItem('saleem_ui_lang', selectedLanguage);
        localStorage.setItem('saleem_user_language', selectedLanguage);
        localStorage.setItem('saleem_user_joined', new Date().toISOString());

        // 2. Permanent IndexedDB Secondary Fallback Persistence
        try {
            const dbReq = indexedDB.open('SaleemDB', 1);
            dbReq.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('userProfile')) {
                    db.createObjectStore('userProfile', { keyPath: 'key' });
                }
            };
            dbReq.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('userProfile', 'readwrite');
                const store = tx.objectStore('userProfile');
                store.put({ key: 'profile', userId, userName, nationality, lang: selectedLanguage });
            };
        } catch (err) {
            console.warn('IndexedDB persistence fallback:', err);
        }

        // 3. Supabase / Cloud Database Persistence Sync
        syncProfileToCloudDB(userId, userName, nationality, selectedLanguage);

        // Auto-change UI language
        if (uiLangSwitcher) uiLangSwitcher.value = selectedLanguage;
        setUiLanguage(selectedLanguage, { syncRemote: false });

        // Auto-set Translator Source Language
        const sourceLangSelect = document.getElementById('source-lang');
        if (sourceLangSelect) {
            sourceLangSelect.value = selectedLanguage;
        }

        updateUserProfileUI(userName, nationality, userId);
    }

    async function syncProfileToCloudDB(userId, userName, nationality, lang) {
        try {
            if (API.getToken()) {
                const res = await API.fetch('/auth/profile', {
                    method: 'PUT',
                    body: JSON.stringify({ name: userName, nationality, preferred_language: lang })
                });
                if (res.user) {
                    console.log('Profile synchronized with Saleem Server:', res.user.id);
                }
            } else {
                // Check if this is a Supabase-authenticated user
                const supabaseUid = localStorage.getItem('saleem_supabase_uid');
                if (supabaseUid) {
                    // Register via anonymous auth endpoint
                    const res = await API.fetch('/auth/register-anon', {
                        method: 'POST',
                        body: JSON.stringify({ supabase_uid: supabaseUid, name: userName, nationality, preferred_language: lang })
                    });
                    if (res.token) {
                        API.setToken(res.token);
                        console.log('Anonymous auth registered on Saleem Server:', res.user.id);
                    }
                } else {
                    // Legacy fallback: register with synthetic email
                    const email = `${userId.toLowerCase()}@saleem.local`;
                    const res = await API.fetch('/auth/register', {
                        method: 'POST',
                        body: JSON.stringify({ email, password: getOrCreateLocalSecret(), name: userName, nationality, preferred_language: lang })
                    });
                    if (res.token) {
                        API.setToken(res.token);
                        console.log('Registered new session on Saleem Server:', res.user.id);
                    }
                }
            }
        } catch (e) {
            console.warn('Cloud sync offline fallback active:', e.message);
        }
    }

    function updateUserProfileUI(userName, nationality, userId) {
        if (!userId) userId = localStorage.getItem('saleem_user_id') || 'SLM-849201';

        document.querySelectorAll('.user-name').forEach(el => el.textContent = userName);
        
        const natDisplay = document.getElementById('user-profile-nat');
        if (natDisplay) natDisplay.textContent = nationality;

        const idDisplay = document.getElementById('user-profile-id');
        if (idDisplay) idDisplay.textContent = userId;

        // Sync header user details
        const natSpan = document.getElementById('user-profile-nat-header');
        if (natSpan) natSpan.textContent = nationality;
    }

    // Edit Profile Button Event
    const btnEditProfile = document.getElementById('btn-edit-profile');
    if (btnEditProfile) {
        btnEditProfile.addEventListener('click', () => {
            showOnboardingModal();
        });
    }

    // Initialize Language Switcher & Onboarding Check
    if (uiLangSwitcher) {
        const savedLang = normalizeLanguage(localStorage.getItem('saleem_ui_lang') || localStorage.getItem('saleem_user_language') || 'en');
        uiLangSwitcher.value = savedLang;
        setUiLanguage(savedLang, { syncRemote: false });

        uiLangSwitcher.addEventListener('change', (e) => {
            setUiLanguage(e.target.value, { syncRemote: true });
        });

        // An authenticated profile is authoritative after the local preference
        // has been applied, so reopening the app does not reset the language.
        if (API.getToken()) {
            API.fetch('/auth/me').then(data => {
                const serverLanguage = data?.user?.preferred_language;
                if (serverLanguage && LANGUAGE_METADATA[serverLanguage]) {
                    setUiLanguage(serverLanguage, { syncRemote: false });
                }
            }).catch(() => {});
        }
    }

    // Onboarding belongs to the application shell, never the public landing page.
    if (document.querySelector('.app-layout')) checkFirstTimeOnboarding();

    // -------------------------------------------------------------
    // 4. NAVIGATION TAB SWITCHER & GLOBAL SEARCH
    // -------------------------------------------------------------
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const bottomNavBtns = document.querySelectorAll('.bottom-nav-btn');
    const moreDrawerItems = document.querySelectorAll('.more-drawer-item');
    const moreDrawer = document.getElementById('more-drawer');
    const moreBackdrop = document.getElementById('more-backdrop');

    // Shared tab-switching function (used by sidebar, bottom nav, and more drawer)
    function switchToTab(targetTab) {
        // Switch tab panes
        tabPanes.forEach(p => p.classList.remove('active'));
        const pane = document.getElementById(targetTab);
        if (pane) pane.classList.add('active');

        // Sync sidebar nav active state
        navItems.forEach(i => i.classList.remove('active'));
        const sidebarItem = document.querySelector(`.nav-item[data-tab="${targetTab}"]`);
        if (sidebarItem) sidebarItem.classList.add('active');

        // Sync bottom nav active state
        const primaryTabs = ['tab-learn-translate', 'tab-saleem-ai', 'tab-community-hub', 'tab-profile-dashboard'];
        bottomNavBtns.forEach(b => b.classList.remove('active'));
        const bottomBtn = document.querySelector(`.bottom-nav-btn[data-tab="${targetTab}"]`);
        if (bottomBtn) bottomBtn.classList.add('active');
        // If it's a secondary tab (from More drawer), no bottom nav btn gets active — that's fine

        // Close more drawer if open
        closeMoreDrawer();
    }

    // Sidebar nav click handlers
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchToTab(item.getAttribute('data-tab'));
        });
    });

    // Bottom nav click handlers
    bottomNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            if (tab === 'more') {
                toggleMoreDrawer();
            } else {
                switchToTab(tab);
            }
        });
    });

    // More drawer item click handlers
    moreDrawerItems.forEach(item => {
        item.addEventListener('click', () => {
            switchToTab(item.getAttribute('data-tab'));
        });
    });

    // More drawer open/close
    function toggleMoreDrawer() {
        const isOpen = moreDrawer && moreDrawer.classList.contains('open');
        if (isOpen) {
            closeMoreDrawer();
        } else {
            openMoreDrawer();
        }
    }

    function openMoreDrawer() {
        if (moreDrawer) moreDrawer.classList.add('open');
        if (moreBackdrop) moreBackdrop.classList.add('open');
    }

    function closeMoreDrawer() {
        if (moreDrawer) moreDrawer.classList.remove('open');
        if (moreBackdrop) moreBackdrop.classList.remove('open');
    }

    // Close more drawer on backdrop click
    if (moreBackdrop) {
        moreBackdrop.addEventListener('click', closeMoreDrawer);
    }

    // -------------------------------------------------------------
    // REAL-TIME GLOBAL SHARED COMMUNITY FORUM & REPLIES SYSTEM
    // -------------------------------------------------------------
    const btnPostQa = document.getElementById('btn-post-qa');
    const qaTitleInput = document.getElementById('qa-title');
    const qaDescInput = document.getElementById('qa-desc');
    const communityPostsList = document.getElementById('community-posts-list');

    // Default starter posts with sample replies
    const defaultCommunityPosts = [
        {
            id: 'post-101',
            author: 'Tariq Al-Bashir',
            nationality: 'Sudan',
            title: 'Where can I find free Egyptian Arabic language classes in Maadi or Nasr City?',
            desc: 'Ahlan everyone! I recently arrived from Khartoum and am looking for recommended NGO clinics or language centers offering conversational Egyptian Arabic.',
            timestamp: '2 hours ago',
            replies: [
                {
                    id: 'rep-1',
                    author: 'Ahmed El-Sayed',
                    nationality: 'Egypt',
                    text: 'Welcome Tariq! StARS (St. Andrew’s Refugee Services) in Downtown Cairo offers free Arabic and English classes. You can also check Caritas in Nasr City.',
                    timestamp: '1 hour ago'
                },
                {
                    id: 'rep-2',
                    author: 'Rahma Tesfaye',
                    nationality: 'Ethiopia',
                    text: 'I second StARS! They have great teachers who speak Amharic, Oromo, and Arabic.',
                    timestamp: '45 mins ago'
                }
            ]
        },
        {
            id: 'post-102',
            author: 'Rahma Tesfaye',
            nationality: 'Ethiopia',
            title: 'UNHCR Yellow Card registration renewal checklist',
            desc: 'For anyone renewing their yellow card at the 6th of October main office: remember to bring 4 recent passport photos and your stamped Aqd Igar (lease agreement).',
            timestamp: '5 hours ago',
            replies: [
                {
                    id: 'rep-3',
                    author: 'Omar Hassan',
                    nationality: 'Somalia',
                    text: 'Thank you Rahma! Do we need to make an appointment online first or go early in the morning?',
                    timestamp: '3 hours ago'
                },
                {
                    id: 'rep-4',
                    author: 'Rahma Tesfaye',
                    nationality: 'Ethiopia',
                    text: 'Hi Omar! It is best to arrive by 7:30 AM to get an queue number.',
                    timestamp: '2 hours ago'
                }
            ]
        }
    ];

    let communityPostsCache = [];

    loadGlobalCommunityPosts();
    setInterval(loadGlobalCommunityPosts, 30000);

    async function loadGlobalCommunityPosts() {
        if (!communityPostsList) return;

        let postsToRender = [];

        try {
            const data = await API.fetch('/community/posts');
            if (data && Array.isArray(data.posts)) {
                postsToRender = data.posts.map(mapServerPost);
                communityPostsCache = postsToRender;
                localStorage.setItem('saleem_community_posts', JSON.stringify(postsToRender));
            }
        } catch (err) {
            console.warn('Community sync offline mode active:', err);
            const localSaved = JSON.parse(localStorage.getItem('saleem_community_posts') || 'null');
            postsToRender = Array.isArray(localSaved) ? localSaved : [];
        }

        renderCommunityPostsUI(postsToRender);
    }

    function mapServerPost(post) {
        return {
            id: post.id,
            author: post.author_name || 'Community member',
            nationality: post.author_nationality || 'Community',
            title: post.title,
            desc: post.body || post.title,
            category: post.category || 'general',
            timestamp: post.created_at ? new Date(post.created_at).toLocaleString() : getLanguageRuntimeText('serviceRecentlyVerified'),
            replies: (post.replies || []).map(reply => ({
                id: reply.id,
                author: reply.author_name || 'Community member',
                nationality: reply.author_nationality || 'Community',
                text: reply.body,
                timestamp: reply.created_at ? new Date(reply.created_at).toLocaleString() : getLanguageRuntimeText('serviceRecentlyVerified')
            }))
        };
    }

    function mergePosts(primaryList, secondaryList) {
        const map = new Map();
        [...primaryList, ...secondaryList].forEach(p => {
            if (p && p.id) {
                if (!map.has(p.id)) {
                    map.set(p.id, p);
                } else {
                    const existing = map.get(p.id);
                    const mergedReplies = [...(existing.replies || []), ...(p.replies || [])];
                    const uniqueReplies = Array.from(new Map(mergedReplies.map(r => [r.id || (r.author + r.text), r])).values());
                    map.set(p.id, { ...existing, replies: uniqueReplies });
                }
            }
        });
        return Array.from(map.values());
    }

    function persistLocalCommunityPosts(posts) {
        communityPostsCache = posts;
        localStorage.setItem('saleem_community_posts', JSON.stringify(posts));
        renderCommunityPostsUI(posts);
    }

    function renderCommunityPostsUI(posts) {
        if (!communityPostsList) return;
        communityPostsList.innerHTML = '';

        if (!Array.isArray(posts) || posts.length === 0) {
            communityPostsList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-comments"></i>
                    <h4>${escapeHtml(getUiTranslation('discussionFeed'))}</h4>
                    <p>${escapeHtml(getUiTranslation('privateProgress'))}</p>
                </div>
            `;
            return;
        }

        posts.forEach(post => {
            const replies = post.replies || [];
            const postCard = document.createElement('div');
            postCard.className = 'card action-card';
            postCard.style.padding = '18px 20px';
            postCard.style.marginBottom = '0';
            postCard.style.background = 'var(--bg-dark)';
            postCard.style.border = '1px solid var(--glass-border)';

            let repliesHTML = '';
            replies.forEach(r => {
                repliesHTML += `
                    <div style="padding: 10px 14px; background: var(--surface-dark); border-radius: 10px; border-left: 3px solid var(--warm-sand); margin-top: 8px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <strong style="font-size: 12px; color: #fff;">${escapeHtml(r.author)}</strong>
                                <span class="tag" style="padding: 1px 6px; font-size: 9px; border-color: var(--emerald); color: var(--emerald);">${escapeHtml(r.nationality || getUiTranslation('discussionFeed'))}</span>
                            </div>
                            <span style="font-size: 10px; color: var(--text-dim);">${escapeHtml(r.timestamp || getLanguageRuntimeText('serviceRecentlyVerified'))}</span>
                        </div>
                        <p style="font-size: 13px; color: var(--text-light); margin: 0; line-height: 1.4;">${escapeHtml(r.text)}</p>
                    </div>
                `;
            });

            postCard.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="avatar" style="width: 32px; height: 32px; font-size: 14px;"><i class="fa-solid fa-user-astronaut"></i></div>
                        <div>
                            <span style="font-size: 14px; font-weight: 600; color: #fff; display: block;">${escapeHtml(post.author)}</span>
                            <span class="tag" style="padding: 1px 6px; font-size: 10px; border-color: var(--warm-sand); color: var(--warm-sand);">${escapeHtml(post.nationality || getUiTranslation('discussionFeed'))}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button class="btn btn-outline" onclick="translatePost('${escapeHtml(post.id)}')" style="padding: 4px 8px; font-size: 11px;">
                            <i class="fa-solid fa-language"></i> ${escapeHtml(getLanguageRuntimeText('languagePair'))}
                        </button>
                        <span style="font-size: 11px; color: var(--text-dim);"><i class="fa-regular fa-clock"></i> ${escapeHtml(post.timestamp || 'Recently')}</span>
                    </div>
                </div>

                <h4 style="font-size: 16px; font-weight: 600; color: var(--warm-sand); margin-bottom: 8px; line-height: 1.3;">${escapeHtml(post.title)}</h4>
                <p style="font-size: 14px; color: var(--text-muted); line-height: 1.5; margin-bottom: 10px;">${escapeHtml(post.desc)}</p>

                <!-- Translation Container -->
                <div id="post-translation-${post.id}"></div>

                <!-- Answers / Replies List -->
                <div style="margin-bottom: 14px; margin-top: 10px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--emerald); margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="fa-solid fa-comments"></i> ${replies.length} ${escapeHtml(getAppActionText('replies'))}</span>
                        <span style="font-size: 11px; color: var(--text-dim);"><i class="fa-solid fa-globe"></i> ${escapeHtml(getAppActionText('visible'))}</span>
                    </div>
                    <div id="replies-container-${post.id}">
                        ${repliesHTML}
                    </div>
                </div>

                <!-- Interactive Reply Input Box -->
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <input type="text" id="reply-input-${escapeHtml(post.id)}" placeholder="Write an answer or reply..." class="form-control" style="font-size: 12px; padding: 8px 12px; margin: 0; flex: 1; border-radius: 8px; background: var(--surface-dark);">
                    <button class="btn btn-primary" onclick="submitReply('${escapeHtml(post.id)}')" style="padding: 8px 14px; font-size: 12px; border-radius: 8px;">
                        <i class="fa-solid fa-paper-plane"></i> Reply
                    </button>
                </div>
            `;

            communityPostsList.appendChild(postCard);
        });
    }

    window.translatePost = async function(postId) {
        const targetContainer = document.getElementById(`post-translation-${postId}`);
        if (!targetContainer) return;

        targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--warm-sand);"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(getLanguageRuntimeText('translationUnavailable'))}</span>`;

        const savedPosts = communityPostsCache.length ? communityPostsCache : JSON.parse(localStorage.getItem('saleem_community_posts') || '[]');
        const post = savedPosts.find(p => p.id === postId);

        if (!post) return;

        const currentLang = localStorage.getItem('saleem_user_language') || 'en';

        try {
            const data = await API.fetch('/ai/translate', {
                method: 'POST',
                body: JSON.stringify({
                    text: `Title: ${post.title}\nDescription: ${post.desc}`,
                    target_lang: currentLang
                })
            });

            const translatedText = data && data.translation ? data.translation : (post.title + ' - ' + post.desc);

            targetContainer.innerHTML = `
                <div style="padding: 10px 12px; background: rgba(232, 171, 99, 0.15); border: 1px solid var(--warm-sand); border-radius: 10px; margin-top: 8px;">
                    <div style="font-size: 11px; color: var(--warm-sand); font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-language"></i> ${escapeHtml(getLanguageRuntimeText('languagePair'))}</div>
                    <p style="font-size: 13px; color: #fff; margin: 0; line-height: 1.4;">${formatTrustedText(translatedText)}</p>
                </div>
            `;
        } catch (e) {
            targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--coral);">${escapeHtml(getLanguageRuntimeText('translationUnavailable'))}</span>`;
        }
    };

    window.submitReply = async function(postId) {
        const replyInput = document.getElementById(`reply-input-${postId}`);
        const replyText = replyInput ? replyInput.value.trim() : '';

        if (!replyText) {
            alert('Please type a reply first.');
            return;
        }

        const currentAuthor = localStorage.getItem('saleem_user_name') || 'Amina Hassan';
        const currentNat = localStorage.getItem('saleem_user_nationality') || 'Sudan';

        const savedPosts = communityPostsCache.length ? [...communityPostsCache] : JSON.parse(localStorage.getItem('saleem_community_posts') || '[]');
        const postIndex = savedPosts.findIndex(p => p.id === postId);

        const newReply = {
            id: 'rep-' + Date.now(),
            author: currentAuthor,
            nationality: currentNat,
            text: replyText,
            timestamp: 'Just now'
        };

        try {
            const data = await API.fetch(`/community/posts/${encodeURIComponent(postId)}/reply`, {
                method: 'POST',
                body: JSON.stringify({ body: replyText })
            });
            if (data && data.reply) {
                await loadGlobalCommunityPosts();
                if (replyInput) replyInput.value = '';
                return;
            }
        } catch (e) {
            console.warn('Reply saved locally until connection returns:', e);
        }

        if (postIndex !== -1) {
            if (!savedPosts[postIndex].replies) savedPosts[postIndex].replies = [];
            savedPosts[postIndex].replies.push(newReply);
        }
        persistLocalCommunityPosts(savedPosts);
        if (replyInput) replyInput.value = '';
    };

    if (btnPostQa) {
        btnPostQa.addEventListener('click', async () => {
            const title = qaTitleInput ? qaTitleInput.value.trim() : '';
            const desc = qaDescInput ? qaDescInput.value.trim() : '';

            if (!title) {
                alert('Please enter a question title.');
                return;
            }

            const currentAuthor = localStorage.getItem('saleem_user_name') || 'Amina Hassan';
            const currentNat = localStorage.getItem('saleem_user_nationality') || 'Sudan';

            const newPost = {
                id: 'post-' + Date.now(),
                author: currentAuthor,
                nationality: currentNat,
                title: title,
                desc: desc || title,
                timestamp: 'Just now',
                replies: []
            };

            try {
                const data = await API.fetch('/community/posts', {
                    method: 'POST',
                    body: JSON.stringify({ title, body: desc || title, category: 'general' })
                });
                if (data && data.post) {
                    await loadGlobalCommunityPosts();
                }
            } catch (e) {
                console.warn('Post saved locally until connection returns:', e);
                const savedPosts = communityPostsCache.length ? [...communityPostsCache] : JSON.parse(localStorage.getItem('saleem_community_posts') || '[]');
                savedPosts.unshift(newPost);
                persistLocalCommunityPosts(savedPosts);
            }

            if (qaTitleInput) qaTitleInput.value = '';
            if (qaDescInput) qaDescInput.value = '';
        });
    }

    // -------------------------------------------------------------
    // REAL-TIME GLOBAL SHARED REVIEWS & RATINGS SYSTEM
    // -------------------------------------------------------------
    const btnSubmitReview = document.getElementById('btn-submit-review');
    const reviewHelpInput = document.getElementById('review-help-text');
    const reviewImprovementInput = document.getElementById('review-improvement-text');
    const reviewsFeedContainer = document.getElementById('reviews-feed-container');
    const avgRatingScore = document.getElementById('avg-rating-score');
    const totalReviewsCount = document.getElementById('total-reviews-count');
    const starBtns = document.querySelectorAll('#star-rating-selector .star-btn');

    let currentSelectedRating = 5;

    // Interactive Star Rating Selector
    starBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentSelectedRating = parseInt(btn.getAttribute('data-rating') || '5', 10);
            updateStarSelectorUI(currentSelectedRating);
        });
    });

    function updateStarSelectorUI(rating) {
        starBtns.forEach(btn => {
            const btnRating = parseInt(btn.getAttribute('data-rating') || '0', 10);
            if (btnRating <= rating) {
                btn.style.color = '#FBBF24';
            } else {
                btn.style.color = '#4B5563';
            }
        });
    }

    const defaultUserReviews = [];

    loadGlobalUserReviews();
    setInterval(loadGlobalUserReviews, 5000);

    async function loadGlobalUserReviews() {
        if (!reviewsFeedContainer) return;

        let reviewsToRender = [];

        try {
            const data = await API.fetch('/community/reviews');
            if (data && Array.isArray(data.reviews) && data.reviews.length > 0) {
                const mappedReviews = data.reviews.map(r => ({
                    id: r.id,
                    author: r.author_name || r.author,
                    nationality: r.author_nationality || r.nationality,
                    rating: r.rating,
                    helpText: r.help_text || r.helpText,
                    improvementText: r.improvement_text || r.improvementText,
                    timestamp: r.created_at ? new Date(r.created_at).toLocaleDateString() : getLanguageRuntimeText('serviceRecentlyVerified')
                }));
                reviewsToRender = mappedReviews;
                localStorage.setItem('saleem_user_reviews', JSON.stringify(reviewsToRender));
                if (avgRatingScore) avgRatingScore.textContent = data.average_rating || '0.0';
                if (totalReviewsCount) totalReviewsCount.textContent = data.total_count ? `${data.total_count} ${getUiTranslation('feedbackFeed')}` : getUiTranslation('noPublicReviews');
            }
        } catch (err) {
            console.warn('Reviews sync offline mode active:', err);
            const localSaved = JSON.parse(localStorage.getItem('saleem_user_reviews') || 'null');
            if (localSaved && localSaved.length > 0) {
                reviewsToRender = localSaved;
            }
        }

        renderReviewsUI(reviewsToRender);
    }

    function mergeReviews(primaryList, secondaryList) {
        const map = new Map();
        [...primaryList, ...secondaryList].forEach(r => {
            if (r && r.id && !map.has(r.id)) map.set(r.id, r);
        });
        return Array.from(map.values());
    }

    async function pushReviewsToCloudDB(newReview) {
        try {
            await API.fetch('/community/reviews', {
                method: 'POST',
                body: JSON.stringify({
                    rating: newReview.rating,
                    help_text: newReview.helpText,
                    improvement_text: newReview.improvementText
                })
            });
        } catch (e) {
            console.warn('Review save offline fallback:', e);
        }

        const localSaved = JSON.parse(localStorage.getItem('saleem_user_reviews') || '[]');
        localSaved.unshift(newReview);
        localStorage.setItem('saleem_user_reviews', JSON.stringify(localSaved));
        renderReviewsUI(localSaved);
        loadGlobalUserReviews();
    }

    function renderReviewsUI(reviews) {
        if (!reviewsFeedContainer) return;
        reviewsFeedContainer.innerHTML = '';

        if (!Array.isArray(reviews) || reviews.length === 0) {
            if (avgRatingScore) avgRatingScore.textContent = '0.0';
            if (totalReviewsCount) totalReviewsCount.textContent = getUiTranslation('noPublicReviews');
            reviewsFeedContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-star"></i>
                    <h4>${escapeHtml(getUiTranslation('feedbackFeed'))}</h4>
                    <p>${escapeHtml(getUiTranslation('privateProgress'))}</p>
                </div>
            `;
            return;
        }

        let totalStars = 0;
        reviews.forEach(r => {
            totalStars += (r.rating || 5);
            const starsString = '⭐'.repeat(r.rating || 5);

            const reviewCard = document.createElement('div');
            reviewCard.className = 'card action-card';
            reviewCard.style.padding = '18px 20px';
            reviewCard.style.marginBottom = '0';
            reviewCard.style.background = 'var(--bg-dark)';
            reviewCard.style.border = '1px solid var(--glass-border)';

            reviewCard.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div class="avatar" style="width: 32px; height: 32px; font-size: 14px;"><i class="fa-solid fa-user-astronaut"></i></div>
                        <div>
                            <span style="font-size: 14px; font-weight: 600; color: #fff; display: block;">${escapeHtml(r.author)}</span>
                            <span class="tag" style="padding: 1px 6px; font-size: 10px; border-color: var(--warm-sand); color: var(--warm-sand);">${escapeHtml(r.nationality || getUiTranslation('discussionFeed'))}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button class="btn btn-outline" onclick="translateReview('${r.id}')" style="padding: 4px 8px; font-size: 11px;">
                            <i class="fa-solid fa-language"></i> ${escapeHtml(getLanguageRuntimeText('languagePair'))}
                        </button>
                        <div style="text-align: right;">
                            <div style="font-size: 13px; color: #FBBF24;">${starsString}</div>
                            <span style="font-size: 10px; color: var(--text-dim);">${escapeHtml(r.timestamp || 'Recently')}</span>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 8px;">
                    <strong style="font-size: 12px; color: var(--emerald); display: block; margin-bottom: 2px;"><i class="fa-solid fa-heart"></i> ${escapeHtml(getUiTranslation('reviewHeading'))}</strong>
                    <p style="font-size: 13px; color: var(--text-light); line-height: 1.5; margin: 0;">${escapeHtml(r.helpText)}</p>
                </div>

                ${r.improvementText ? `
                    <div style="padding: 8px 12px; background: var(--surface-dark); border-radius: 8px; border-left: 3px solid var(--warm-sand); margin-top: 8px;">
                        <strong style="font-size: 11px; color: var(--warm-sand); display: block; margin-bottom: 2px;"><i class="fa-solid fa-lightbulb"></i> ${escapeHtml(getUiTranslation('reviewImprovementPlaceholder').replace(/\s*\([^)]*\)/, ''))}</strong>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 0;">${escapeHtml(r.improvementText)}</p>
                    </div>
                ` : ''}

                <div id="review-translation-${r.id}"></div>
            `;

            reviewsFeedContainer.appendChild(reviewCard);
        });

        // Update Average Rating Metrics
        if (reviews.length > 0) {
            const avg = (totalStars / reviews.length).toFixed(1);
            if (avgRatingScore) avgRatingScore.textContent = avg;
            if (totalReviewsCount) totalReviewsCount.textContent = `${reviews.length} ${getUiTranslation('feedbackFeed')}`;
        }
    }

    window.translateReview = async function(reviewId) {
        const targetContainer = document.getElementById(`review-translation-${reviewId}`);
        if (!targetContainer) return;

        targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--warm-sand);"><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(getAppActionText('translating'))}</span>`;

        const savedReviews = JSON.parse(localStorage.getItem('saleem_user_reviews') || '[]');
        const review = savedReviews.find(r => r.id === reviewId) || defaultUserReviews.find(r => r.id === reviewId);

        if (!review) return;

        const currentLang = localStorage.getItem('saleem_user_language') || 'en';

        try {
            const data = await API.fetch('/ai/translate', {
                method: 'POST',
                body: JSON.stringify({
                    text: `How Saleem Helped: ${review.helpText}\nImprovement: ${review.improvementText || 'N/A'}`,
                    target_lang: currentLang
                })
            });

            const translatedText = data && data.translation ? data.translation : getLanguageRuntimeText('translationUnavailable');

            targetContainer.innerHTML = `
                <div style="padding: 10px 12px; background: rgba(232, 171, 99, 0.15); border: 1px solid var(--warm-sand); border-radius: 10px; margin-top: 8px;">
                    <div style="font-size: 11px; color: var(--warm-sand); font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-language"></i> ${escapeHtml(getLanguageRuntimeText('languagePair'))}</div>
                    <p style="font-size: 13px; color: #fff; margin: 0; line-height: 1.4;">${translatedText}</p>
                </div>
            `;
        } catch (e) {
            targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--coral);">${escapeHtml(getLanguageRuntimeText('translationUnavailable'))}</span>`;
        }
    };

    const dailyPhrasesSets = [
        // Set 0: Daily Essentials & Courtesy
        [
            { eg: "معليش", phonetic: "Ma-leshy", note: "It's okay / Don't worry / No problem", am: "ምንም አይደለም", so: "Dhib ma laha", ti: "ገበን የብሉን", sw: "Haitoshi shida", fr: "Ce n'est pas grave", ha: "Babu matsala" },
            { eg: "خلاص", phonetic: "Kha-laas", note: "Finished / Done / That's enough", am: "ተጠናቀቀ", so: "Waa dhamaaday", ti: "ተወዲኡ", sw: "Imekwisha", fr: "C'est fini", ha: "An gama" },
            { eg: "يلا", phonetic: "Yal-la", note: "Let's go / Come on / Hurry up", am: "እንሂድ", so: "Kalay / Ina keen", ti: "ንኺድ", sw: "Twenzeni", fr: "Allons-y", ha: "Mu je" },
            { eg: "ازيك؟", phonetic: "Ez-say-yak?", note: "How are you?", am: "እንዴት ነህ/ነሽ؟", so: "Sidee tahay?", ti: "ከመይ አለኻ/ኺ፧", sw: "Hujambo / Habari gani?", fr: "Comment vas-tu ?", ha: "Yaya kake?" },
            { eg: "شكراً جزيلاً", phonetic: "Shuk-ran Ga-zee-lan", note: "Thank you very much", am: "በጣም አመሰግናለሁ", so: "Mahadsanid aad u badan", ti: "የቐንየለይ ብጣዕሚ", sw: "Asante sana", fr: "Merci beaucoup", ha: "Nagode sosai" },
            { eg: "بكام ده؟", phonetic: "Bee-kam da?", note: "How much does this cost?", am: "ይህ ስንት ነው؟", so: "Pilaa tani?", ti: "እዚ ክንደይ እዩ፧", sw: "Hii ni bei gani?", fr: "Combien ça coûte ?", ha: "Nawa ne wannan?" },
            { eg: "فين المترو؟", phonetic: "Feen el-met-ro?", note: "Where is the nearest metro station?", am: "ሜትሮው ወዴት ነው؟", so: "Xagee ku taal metro-ga?", ti: "መትርኦ ኣበይ ኣሎ፧", sw: "Metro iko wapi?", fr: "Où est le métro ?", ha: "Ina metro yake?" },
            { eg: "ممكن مساعدة؟", phonetic: "Mom-kin mo-saa-a-da?", note: "Can you help me please?", am: "እባክዎን ሊረዱኝ ይችላሉ؟", so: "Ma iga caawin kartaa?", ti: "ክትሕግዘኒ ትኽእልዶ፧", sw: "Tafadhali unaweza kunisaidia?", fr: "Pouvez-vous m'aider ?", ha: "Taimaka min?" },
            { eg: "أنا مش فاهم", phonetic: "A-na mish faa-hem", note: "I don't understand", am: "አልገባኝም", so: "Ma fahmin", ti: "ኣይተረድኣንን", sw: "Sielewi", fr: "Je ne comprends pas", ha: "Ban fahimta ba" },
            { eg: "تمام / قشطة", phonetic: "Ta-maam / Qish-ta", note: "Great / Perfect / All good!", am: "በጣም ጥሩ / ሰላም ነው", so: "Waa hagaag / Cajiib", ti: "ጽቡቕ / ጽቡቕ ኣሎ", sw: "Sawa kabisa", fr: "Parfait / Très bien !", ha: "Yayi kyau" }
        ],
        // Set 1: Markets & Transport Etiquette
        [
            { eg: "يا باشا", phonetic: "Ya Ba-sha", note: "Polite honorific for men / Sir", am: "ጌታዬ", so: "Zowr / Mudane", ti: "ጎይታይ", sw: "Bwana wangu", fr: "Monsieur / Chef", ha: "Malam" },
            { eg: "على جنب يا اسطى", phonetic: "A-la gamb ya os-ta", note: "Drop me off here please (Taxi/Microbus)", am: "እዚች ጋር አውርደኝ", so: "Halkan igu deji", ti: "ኣብዚ ኣውርደኒ", sw: "Nishushe hapa driver", fr: "Déposez-moi ici s'il vous plaît", ha: "Sauke ni anan" },
            { eg: "من فضلـك", phonetic: "Min fad-lak", note: "Please / Kindly", am: "እባክህን/ሽን", so: "Tafadhali", ti: "ብኸበሮተይ", sw: "Tafadhali", fr: "S'il vous plaît", ha: "Dan Allah" },
            { eg: "غالي قوي", phonetic: "Ghaa-lee a-wee", note: "That's too expensive!", am: "በጣም ውድ ነው", so: "Waqti qaali ah", ti: "ብጣዕሚ ኽቡር እዩ", sw: "Ni ghali sana!", fr: "C'est trop cher !", ha: "Yayi tsada da yawa" },
            { eg: "آخر كلام كام؟", phonetic: "Aa-kher ka-laam kam?", note: "What is your final best price?", am: "መጨረሻ ዋጋው ስንት ነው؟", so: "Kalamka uigu dambeeya waa pila?", ti: "መወዳእታ ዋጋ ክንደይ እዩ፧", sw: "Bei ya mwisho ni kiasi gani?", fr: "C'est quoi votre dernier prix ?", ha: "Karshen magana nawa ne?" },
            { eg: "حاضر من عيوني", phonetic: "Haa-der min e-yoo-nee", note: "With pleasure / Right away!", am: "በደስታ / አሁኑኑ", so: "Waa ku kan / Farxad", ti: "ብሓጐስ", sw: "Kwa furaha kabisa", fr: "Avec plaisir !", ha: "An gama da farinciki" },
            { eg: "ربنا يخليك", phonetic: "Rab-be-na ye-khal-leek", note: "May God bless & keep you (Thank you)", am: "እግዚአብሔር ይባርክህ", so: "Eebbe ha ku barakeeyo", ti: "እግዚኣብሔር ይባርኽካ", sw: "Mungu akubariki", fr: "Que Dieu vous bénisse", ha: "Allah ya albarkace ka" },
            { eg: "الف سلامة", phonetic: "Alf sa-laa-ma", note: "Get well soon / Stay safe", am: "ምህረቱን ያውርድልህ", so: "Caafimaad ha ku siiyo", ti: "ምሕረት ይውረደልካ", sw: "Upone haraka", fr: "Bon rétablissement", ha: "Allah ya baka lafiya" },
            { eg: "صباح الفل", phonetic: "Sa-baah el-ful", note: "Beautiful morning! / Good morning!", am: "መልካም ጧት", so: "Subax wanaagsan", ti: "ደሓን ኣምሲሕካ", sw: "Habari ya asubuhi njema", fr: "Bonjour et belle journée !", ha: "Barka da asuba" },
            { eg: "مساء القشطة", phonetic: "Ma-saa el-qish-ta", note: "Lovely evening! / Good evening!", am: "መልካም ምሽት", so: "Galab wanaagsan", ti: "ደሓን አምሲኻ", sw: "Habari ya jioni", fr: "Bonne soirée !", ha: "Barka da yamma" }
        ],
        // Set 2: Social Etiquette & Daily Life
        [
            { eg: "عن اذنك", phonetic: "An iz-nak", note: "Excuse me / With your permission", am: "ይቅርታ", so: "Fadlan i sii ruqsad", ti: "ይቕሬታ", sw: "Nisamehe / Ruhusa", fr: "Excusez-moi", ha: "Gafara dai" },
            { eg: "ولا يهمك", phonetic: "Wa la ye-hem-mak", note: "Don't worry about it at all", am: "አይጨነቁ", so: "Hala walwalin", ti: "ኣይትጨነቕ", sw: "Usijali ata kidogo", fr: "Ne vous en faites pas", ha: "Ka da ka damu" },
            { eg: "ماشي الحال", phonetic: "Maa-shee el-haal", note: "Things are going well / So-so", am: "ደህና ነው", so: "Halkaa ayay maraysaa", ti: "ደሓን እዩ", sw: "Mambo yanaenda vyema", fr: "Ça va comme ci comme ça", ha: "Lafiya lau" },
            { eg: "فرصة سعيدة", phonetic: "For-sa sa-ee-da", note: "Nice meeting you!", am: "ስላወኳችሁ ደስ ብሎኛል", so: "Kula kulankeyga waa farxad", ti: "ምስኻ ምልላየይ ጽቡቕ እዩ", sw: "Nimefurahi kukufahamu", fr: "Enchanté de vous rencontrer !", ha: "Naji dadin saduwa da kai" },
            { eg: "نورت مصر", phonetic: "Naw-wart Masr", note: "You have brightened Egypt! (Welcome)", am: "እንኳን ወደ ግብፅ በሰላም መጣህ", so: "Kusoo dhawoow Masar", ti: "እንኳዕ ናብ ግብצי ብሰላም መጻእካ", sw: "Karibu sana Misri", fr: "Bienvenue en Égypte !", ha: "Barka da zuwa Misira" },
            { eg: "ربنا يعوض عليك", phonetic: "Rab-be-na ye-aw-wad a-leek", note: "May God compensate & bless your loss", am: "እግዚአብሔር ይተካላችሁ", so: "Eebbe ha ku bedelo ka sii fiican", ti: "እግዚኣብሔር ይተክኣልካ", sw: "Mungu akulipe badala yake", fr: "Que Dieu vous compense", ha: "Allah ya maido muku ko yakara" },
            { eg: "تسلم ايدك", phonetic: "Tes-lam ee-dak", note: "Bless your hands (Thank you for cooking/work)", am: "እጅህ/ሽ ይባረክ", so: "Gacantaada ha barakoobto", ti: "ኢድካ ትባረኽ", sw: "Mikono yako ibarikiwe", fr: "Merci pour ce travail / ce repas", ha: "Hannayenku su albarkatu" },
            { eg: "كل سنة وانت طيب", phonetic: "Kol sa-na wa en-ta tay-yeb", note: "Happy celebration / Annual wishes!", am: "መልካም በዓል", so: "Sannad wanaagsan", ti: "ርሑስ በዓል", sw: "Hassani ya mwaka mpya / sikukuu", fr: "Meilleurs vœux pour la fête !", ha: "Barka da wannan lokaci" },
            { eg: "بالهنا والشفا", phonetic: "Bel-ha-na wal-she-fa", note: "Bon appétit / Enjoy your meal!", am: "መልካም ምግብ", so: "Cunto wanaagsan", ti: "ጽቡቕ መግቢ", sw: "Heri ya chakula", fr: "Bon appétit !", ha: "A ci lafiya" },
            { eg: "الله يسلمك", phonetic: "Al-lah ye-sal-mak", note: "May God protect you (Response to safe wishes)", am: "እግዚአብሔር ይጠብቅህ", so: "Eebbe ha ku nabad geliyo", ti: "እግዚኣብሔር የዕቅብካ", sw: "Mungu akulinde pia", fr: "Que Dieu vous protège", ha: "Allah ya kaye ka" }
        ]
    ];

    function renderDailyPhrasesUI() {
        const containers = [
            document.getElementById('daily-phrases-container'),
            document.getElementById('daily-phrases-container-inline')
        ].filter(Boolean);

        if (containers.length === 0) return;

        // Dynamic 365-Day Daily Rotation Engine: picks today's set based on Day of Year
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 0);
        const diff = now - startOfYear;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);
        const todaySetIndex = dayOfYear % dailyPhrasesSets.length;
        const todayPhrasesData = dailyPhrasesSets[todaySetIndex];

        const currentLang = localStorage.getItem('saleem_user_language') || 'en';

        containers.forEach(container => {
            container.innerHTML = '';
            todayPhrasesData.forEach((item, index) => {
                const translatedNote = item[currentLang] || item.note;
                const card = document.createElement('div');
                card.style.padding = '10px 14px';
                card.style.background = 'var(--bg-dark)';
                card.style.borderRadius = '10px';
                card.style.border = '1px solid var(--glass-border)';
                card.style.display = 'flex';
                card.style.alignItems = 'center';
                card.style.justifyContent = 'space-between';

                const phoneticText = item.phonetic || 'Phonetic Guide';
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 11px; font-weight: 700; color: var(--warm-sand); width: 20px;">#${index + 1}</span>
                        <div>
                            <strong style="font-size: 14px; color: #fff; display: block;">${item.eg}</strong>
                            <div style="font-size: 11px; color: var(--warm-sand); margin-top: 2px;"><i class="fa-solid fa-comment-dots"></i> <strong>How to say:</strong> ${phoneticText}</div>
                            <span style="font-size: 12px; color: var(--emerald); display: block; margin-top: 2px;">${translatedNote}</span>
                        </div>
                    </div>
                    <button class="icon-btn btn-speak-daily" title="Pronunciation Info">
                        <i class="fa-solid fa-comment-nodes" style="color: var(--warm-sand);"></i>
                    </button>
                `;
                const speakBtn = card.querySelector('.btn-speak-daily');
                if (speakBtn) {
                    speakBtn.addEventListener('click', () => speakText(item.eg, 'ar-EG'));
                }
                container.appendChild(card);
            });
        });
    }

    const btnCompleteQuest = document.getElementById('btn-complete-quest');
    const btnCompleteQuestInline = document.getElementById('btn-complete-quest-inline');

    function handleQuestCompletion() {
        let streak = parseInt(localStorage.getItem('saleem_quest_streak') || '1', 10);
        streak += 1;
        localStorage.setItem('saleem_quest_streak', streak.toString());

        const streakText = document.getElementById('quest-streak-text');
        const progressBar = document.getElementById('quest-progress-bar');

        if (streakText) streakText.textContent = `🔥 ${streak} Days Streak • 10/10 Complete Today! 🎉`;
        if (progressBar) progressBar.style.width = '100%';

        alert(`🎉 Congratulations! You completed today's 10 Egyptian Words & Culture Quest! Current Streak: ${streak} Days 🔥`);
    }

    if (btnCompleteQuest) btnCompleteQuest.addEventListener('click', handleQuestCompletion);
    if (btnCompleteQuestInline) btnCompleteQuestInline.addEventListener('click', handleQuestCompletion);

    renderDailyPhrasesUI();

    if (btnSubmitReview) {
        btnSubmitReview.addEventListener('click', async () => {
            const helpText = reviewHelpInput ? reviewHelpInput.value.trim() : '';
            const improvementText = reviewImprovementInput ? reviewImprovementInput.value.trim() : '';

            if (!helpText) {
                alert('Please describe how Saleem helped you.');
                return;
            }

            const currentAuthor = localStorage.getItem('saleem_user_name') || 'Amina Hassan';
            const currentNat = localStorage.getItem('saleem_user_nationality') || 'Sudan';

            const newReview = {
                id: 'rev-' + Date.now(),
                author: currentAuthor,
                nationality: currentNat,
                rating: currentSelectedRating,
                helpText: helpText,
                improvementText: improvementText,
                timestamp: 'Just now'
            };

            if (reviewHelpInput) reviewHelpInput.value = '';
            if (reviewImprovementInput) reviewImprovementInput.value = '';

            await pushReviewsToCloudDB(newReview);
            alert('Thank you for your review! Your feedback is now live for everyone.');
        });
    }

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
            switchToTab('tab-legal');
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

            const primaryLanguage = getSelectedLanguage();
            const srcLang = primaryLanguage;
            const tgtLang = 'ar_eg';

            translateOutput.innerHTML = `<p><i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(getLanguageRuntimeText('translationUnavailable'))}</p>`;

            // Local Dialect Expressions Dictionary Lookup (Zero Latency)
            const lowerKey = text.toLowerCase().trim();
            const dialectLookup = {
                "خلصانه بشياكه يعم": { res: "It's a deal gracefully, my friend! / Settled in style, man!", note: "Cultural Nuance: Popular Egyptian slang used to gracefully finalize an agreement or deal." },
                "خلصانه بشياكه": { res: "It's a deal in style! / Settled gracefully!", note: "Cultural Nuance: Popular Egyptian slang expression meaning deal agreed or settled nicely." },
                "خلصانه": { res: "It's a deal! / Settled! / Done!", note: "Cultural Nuance: Common Egyptian slang for deal, finished, or agreed." },
                "قشطة": { res: "Awesome! / Perfectly fine!", note: "Cultural Nuance: Popular Egyptian expression meaning awesome or totally fine." },
                "قشطة وزي الفل": { res: "Awesome and super fine!", note: "Cultural Nuance: Egyptian expression meaning everything is great." },
                "على جنب يا اسطى": { res: "Pull over here driver, please!", note: "Cultural Nuance: Essential Egyptian phrase used in taxis and microbuses." },
                "تسلم إيدك": { res: "Well done! / Great job!", note: "Cultural Nuance: Traditional Egyptian blessing praising great work or cooking." },
                "عاشت إيدك": { res: "Well done! / Great performance!", note: "Cultural Nuance: Expression praising good work or skill." },
                "بكم ده": { res: "How much is this?", note: "Cultural Nuance: Standard Egyptian market bargaining phrase." },
                "ده بكام": { res: "How much is this?", note: "Cultural Nuance: Standard Egyptian shopping question." },
                "ملخبط": { res: "Mixed up / confused", note: "Egyptian word for disorganized or confused." },
                "معقول": { res: "Really? / Is it possible?", note: "Egyptian rhetorical question expressing surprise." }
            };

            for (const pattern in dialectLookup) {
                if (primaryLanguage !== 'en') break;
                if (lowerKey.includes(pattern)) {
                    const match = dialectLookup[pattern];
                    translateOutput.innerHTML = `
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                            <span class="tag" style="border-color: var(--emerald); color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(getLanguageRuntimeText('egyptianArabicOnly'))}</span>
                            <button class="btn btn-primary" id="btn-speak-output" style="padding: 6px 14px; font-size: 12px;">
                                <i class="fa-solid fa-volume-high"></i> Listen Egyptian Audio
                            </button>
                        </div>
                        <h3 style="color: var(--warm-sand); font-size: 20px; line-height: 1.5;">${match.res}</h3>
                        <p style="margin-top: 10px; font-size: 13px; color: var(--text-muted);"><i class="fa-solid fa-lightbulb text-gold"></i> ${match.note}</p>
                    `;
                    const btnSpeak = document.getElementById('btn-speak-output');
                    if (btnSpeak) btnSpeak.addEventListener('click', () => speakText(text, 'ar-EG'));
                    saveTranslationHistory(text, match.res);
                    return;
                }
            }

            try {
                const data = await API.fetch('/ai/translate', {
                    method: 'POST',
                    body: JSON.stringify({
                        text,
                        primary_language: primaryLanguage,
                        source_lang: srcLang,
                        target_lang: tgtLang
                    })
                });

                if (data && data.translation && data.source !== 'fallback') {
                    const translationText = formatTrustedText(data.translation);
                    
                    translateOutput.innerHTML = `
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                            <span class="tag" style="border-color: var(--emerald); color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(getUiTranslation('sectionAi'))}</span>
                            <button class="btn btn-primary" id="btn-speak-output" style="padding: 6px 14px; font-size: 12px;">
                                <i class="fa-solid fa-volume-high"></i> ${escapeHtml(getUiTranslation('chatTutor'))}
                            </button>
                        </div>
                        <div style="font-size: 16px; color: var(--text-light); line-height: 1.6;">${translationText}</div>
                        <p style="margin-top: 14px; font-size: 12px; color: var(--emerald); display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-bolt text-gold"></i> ${escapeHtml(getUiTranslation('sectionAi'))}
                        </p>
                    `;

                    const btnSpeak = document.getElementById('btn-speak-output');
                    if (btnSpeak) btnSpeak.addEventListener('click', () => speakText(data.translation, 'ar-EG'));
                    saveTranslationHistory(text, data.translation);
                    return;
                }
            } catch (err) {
                console.warn('Backend translation route offline/fallback active:', err);
            }

            translateOutput.innerHTML = `
                <h3 style="color: var(--warm-sand); font-size: 20px;">${escapeHtml(text)}</h3>
                <p style="margin-top: 10px; font-size: 13px; color: var(--coral);"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(getLanguageRuntimeText('translationUnavailable'))}</p>
            `;
            saveTranslationHistory(text, text);
            return;

            // Provider calls stay server-side; direct browser provider calls are disabled.
            const providerKeyDisabled = "";
            try {
                const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${providerKeyDisabled}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            {
                                role: "system",
                                content: `You are an expert Egyptian dialect translator. NEVER translate Egyptian Arabic slang literally into English word-for-word (e.g. 'خلصانة بشياكة يعم' means 'It is a deal in style, my friend!', NOT 'His salvation with sheaves').

Provide:
1. Clear, natural translation
2. Phonetic pronunciation guide if translating into Arabic
3. A brief cultural note.`
                            },
                            { role: "user", content: `Translate from ${srcLang} to ${tgtLang}: "${text}"` }
                        ],
                        temperature: 0.3,
                        max_tokens: 512
                    })
                });

                if (res.ok) {
                    const groqData = await res.json();
                    let aiReply = groqData.choices?.[0]?.message?.content?.trim();
                    if (aiReply) {
                        aiReply = aiReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().replace(/\n/g, '<br>');
                        translateOutput.innerHTML = `
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
                                <span class="tag" style="border-color: var(--emerald); color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> Saleem AI Dialect Translator</span>
                                <button class="btn btn-primary" id="btn-speak-output" style="padding: 6px 14px; font-size: 12px;">
                                    <i class="fa-solid fa-volume-high"></i> ${escapeHtml(getUiTranslation('chatTutor'))}
                                </button>
                            </div>
                            <div style="font-size: 16px; color: var(--text-light); line-height: 1.6;">${aiReply}</div>
                        `;
                        const btnSpeak = document.getElementById('btn-speak-output');
                        if (btnSpeak) btnSpeak.addEventListener('click', () => speakText(text, 'ar-EG'));
                        saveTranslationHistory(text, aiReply);
                        return;
                    }
                }
            } catch (e) {
                console.warn('Direct Groq LLM translation failed:', e);
            }

            // Fallback
            translateOutput.innerHTML = `
                <h3 style="color: var(--warm-sand); font-size: 20px;">${escapeHtml(getLanguageRuntimeText('languagePair'))}: ${text}</h3>
                <p style="margin-top: 10px; font-size: 13px; color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(getLanguageRuntimeText('translationUnavailable'))}</p>
            `;
            saveTranslationHistory(text, text);
        });
    }

    function saveTranslationHistory(sourceText, targetText) {
        const history = JSON.parse(localStorage.getItem('saleem_translation_history') || '[]');
        history.unshift({ sourceText, targetText, timestamp: new Date().toLocaleString() });
        localStorage.setItem('saleem_translation_history', JSON.stringify(history.slice(0, 20)));
    }

    // -------------------------------------------------------------
    // 6. REAL MULTILINGUAL AI ASSISTANT CHAT (GROQ LLAMA-3.3-70B)
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
        const formattedText = formatTrustedText(text);
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}`;
        msgDiv.innerHTML = `
            <div class="msg-avatar"><i class="fa-solid ${sender === 'user' ? 'fa-user' : 'fa-robot'}"></i></div>
            <div class="msg-content"><strong>${sender === 'user' ? escapeHtml(savedName) : 'Saleem AI'}:</strong> ${formattedText}</div>
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
        typingDiv.innerHTML = `<div class="msg-content" style="color: var(--warm-sand);"><i class="fa-solid fa-bolt fa-spin text-gold"></i> ${escapeHtml(getUiTranslation('chatTutor'))}</div>`;
        chatHistory.appendChild(typingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        try {
            const data = await API.fetch('/ai/chat', {
                method: 'POST',
                body: JSON.stringify({
                    message: prompt,
                    primary_language: getSelectedLanguage(),
                    service_need: prompt,
                    service_city: JSON.parse(localStorage.getItem('saleem_service_area') || '{}').city || '',
                    service_category: document.querySelector('.chip-btn.active')?.getAttribute('data-inst-cat') || ''
                })
            });

            if (data && data.response && data.source !== 'fallback') {
                const indicator = document.getElementById('typing-indicator');
                if (indicator) indicator.remove();
                const cleanResp = data.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                appendMessageUI('assistant', cleanResp);
                return;
            }
        } catch (err) {
            console.warn('Backend AI route offline/fallback active:', err);
        }

        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
        const fallbackMessage = `${getUiTranslation('chatWelcome')} ${getLanguageRuntimeText('translationUnavailable')}`;
        appendMessageUI('assistant', fallbackMessage);
        return;

        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer ",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: "system",
                            content: `You are Saleem AI, a warm multilingual integration assistant. Do not invent service details; tell users to verify high-stakes legal, medical, immigration, and protection information with official providers.

USER CONTEXT: Name: ${savedName}, Origin: ${savedNat}.

KNOWLEDGE BASE & REFUGEE SERVICES DIRECTORY (EGYPT):
- UNHCR Egypt Reception Centre: 17 Mecca El-Mokarrama Street, 7th District, 6th of October City. Verify appointment rules before visiting.
- Legal Aid Partners: StARS (Saint Andrew's Refugee Services), ECRR (Egyptian Council for Refugee Rights) for legal counsel, residency permits (تصريح إقامة), asylum protection (حماية دولية).
- Housing & Rent: Faisal, 6th of October, Maadi, Nasr City. Advise obtaining formal written lease contract (عقد إيجار - Aqd Igar).
- Healthcare & Emergency: Ambulance 123. Medical & psychosocial aid via Caritas Egypt, Egyptian Red Crescent, and PSTIC.
- Education & Children: Public/community schools accept refugee children with UNHCR card & birth certificate (شهادة ميلاد).
- Work & Vocational Training: Free skills training via IRC & CRS (sewing, electrical, mobile repair). Bank accounts can be opened with UNHCR card/passport.
- Dialect Adaptation: Speak fluently in Egyptian Arabic (عامية مصرية), Sudanese Arabic (لهجة سودانية), Amharic, Somali, Tigrinya, English, or Standard Arabic matching whatever user asks.`
                        },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.6,
                    max_tokens: 1024
                })
            });

            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();

            if (res.ok) {
                const groqData = await res.json();
                let aiReply = groqData.choices?.[0]?.message?.content?.trim();
                if (aiReply) {
                    aiReply = aiReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    appendMessageUI('assistant', aiReply);
                    return;
                }
            }
        } catch (e) {
            console.warn('Direct Groq LLM API connection error:', e);
        }

        // Offline Emergency Fallback
        const finalIndicator = document.getElementById('typing-indicator');
        if (finalIndicator) finalIndicator.remove();
        appendMessageUI('assistant', `Ahlan ${savedName}! I am Saleem AI. For housing, public transport, or UNHCR residency renewals, feel free to ask!`);
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
    // 5. SALEEM AI ROLEPLAY SCENARIOS ENGINE
    // -------------------------------------------------------------
    const aiScenarios = {
        cafe: {
            title: "☕ Ordering at a Café (Ahwa Saada / Shai Koshary)",
            prompt: "Let's roleplay! I am an Egyptian barista at a Cairo café. Greet me in Egyptian Arabic ('Ahlan ya basha, tishrab ey enaharda?'), order tea or coffee with your preferred sugar level (Sada, Mazbout, or Ziada), and ask for the bill ('Bikam da ya basha?'). I will guide your Egyptian Arabic pronunciation in real-time!"
        },
        hospital: {
            title: "🏥 At the Hospital & Pharmacy",
            prompt: "Let's roleplay! I am an Egyptian doctor at a Cairo public clinic. Tell me your medical symptoms in Egyptian Arabic (e.g. 'Aandi sda'a', 'Batni betwg'ani', 'Momkin el-daw'a?'), and ask where the pharmacy is located. I will correct your Arabic politely!"
        },
        police: {
            title: "👮 Police Station & Legal Protocol",
            prompt: "Let's roleplay! I am an officer at the Cairo Police Refugee Affairs Unit. Explain your situation politely using honorifics ('Ya Fandim', 'Ana ma'aya al-kart al-asfar UNHCR'), ask for assistance, and I will guide you on legal rights protocols in Egypt."
        },
        rental: {
            title: "🏠 Apartment Lease Negotiation",
            prompt: "Let's roleplay! I am a Cairo apartment landlord in Faisal/Maadi. Greet me ('Sabah al-ful ya hagg'), negotiate the monthly rent ('Akher kalam kam ya basha?'), and ask for a formal stamped lease agreement ('Aqd Igar rasmi')."
        },
        microbus: {
            title: "🚖 Microbus & Taxi Directions",
            prompt: "Let's roleplay! I am a Cairo microbus driver. Tell me your destination ('Ramses ya osta?'), pay your fare, and ask me to drop you off at your stop ('Ala gamb ya osta min fadlak')."
        }
    };

    window.startAiScenario = function(scenarioKey) {
        const scenario = aiScenarios[scenarioKey];
        if (!scenario || !chatInput) return;
        chatInput.value = scenario.prompt;
        handleSendMessage();
    };

    // -------------------------------------------------------------
    // 6. CURATED EGYPTIAN PHRASES LIBRARY ENGINE (45 checked-in entries)
    // -------------------------------------------------------------
    const LEARNING_DATA_VERSION = '2026-08-14-multilingual';
    const LEARNING_CACHE_NAME = `saleem-learning-${LEARNING_DATA_VERSION}`;

    async function fetchLearningAsset(path) {
        const url = `${path}?v=${LEARNING_DATA_VERSION}`;
        if (typeof window !== 'undefined' && 'caches' in window) {
            const cache = await window.caches.open(LEARNING_CACHE_NAME);
            const cached = await cache.match(url);
            if (cached) return cached;
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response.clone());
            return response;
        }
        return fetch(url, { cache: 'force-cache' });
    }

    const phrasesLibraryData = [
        // 🚨 EMERGENCY & SAFETY (50+)
        { eg: "لحقوني! (Laha'oony!)", en: "Help me!", cat: "emergency", lvl: "Beginner" },
        { eg: "اتصل بالإسعاف فورا (Ettasil bel-es'af fawran)", en: "Call the ambulance immediately!", cat: "emergency", lvl: "Beginner" },
        { eg: "في حريقة هنا! (Fee haree'a hena!)", en: "There is a fire here!", cat: "emergency", lvl: "Beginner" },
        { eg: "ضاع مني باسبوري (Daa' minny passporthy)", en: "I lost my passport!", cat: "emergency", lvl: "Intermediate" },
        { eg: "محتاج دكتور حالا (Mehtaaj doctor halan)", en: "I need a doctor right now!", cat: "emergency", lvl: "Beginner" },
        { eg: "النجدة! (El-Nagda!)", en: "Police Help! (Hotline 122)", cat: "emergency", lvl: "Beginner" },
        { eg: "الحقوني يا ناس! (Elha'oony ya nas!)", en: "Help me people!", cat: "emergency", lvl: "Beginner" },
        { eg: "أنا تايه في الشارع (Ana tayeh fe el-share'a)", en: "I am lost in the street.", cat: "emergency", lvl: "Beginner" },
        { eg: "حرامي! مسك حرامي! (Haramy! Mesek haramy!)", en: "Thief! Catch the thief!", cat: "emergency", lvl: "Beginner" },
        { eg: "ابعد عني لو سمحت (Eb'ed anny law samaht)", en: "Stay away from me please!", cat: "emergency", lvl: "Beginner" },

        // 📋 ADMINISTRATIVE & REFUGEE RIGHTS
        { eg: "معايا كارت الإقامة الأصفر (Ma'aya kart el-eqama el-asfar)", en: "I have the UNHCR Yellow Registration Card.", cat: "admin", lvl: "Intermediate" },
        { eg: "عايز أجدد الإقامة في العباسية (Ayiz agadded el-eqama fe El-Abbasiya)", en: "I want to renew my residency at Abbasiya Immigration.", cat: "admin", lvl: "Intermediate" },
        { eg: "أين مكتب المفوضية؟ (Ayna maktab el-mofawadiya?)", en: "Where is the UNHCR Office in 6th of October?", cat: "admin", lvl: "Beginner" },
        { eg: "عايز أعمل عقد إيجار موثق (Ayiz a'amel aqd igar mowathaq)", en: "I need an officially stamped rental lease agreement.", cat: "admin", lvl: "Advanced" },
        { eg: "محتاج ورقة إثبات سكن (Mehtaaj wara'at ethbat sakan)", en: "I need a proof of address document.", cat: "admin", lvl: "Intermediate" },
        { eg: "هل ده قانوني هنا؟ (Hal da qanoony hena?)", en: "Is this legal here in Egypt?", cat: "admin", lvl: "Intermediate" },
        { eg: "عايز أقدم لولادي في المدرسة (Ayiz aqaddem le welady fe el-madrasa)", en: "I want to enroll my children in school.", cat: "admin", lvl: "Advanced" },
        { eg: "أنا لاجئ مسجل رسميا (Ana lage'a mosaggal rasmiyan)", en: "I am an officially registered refugee.", cat: "admin", lvl: "Intermediate" },

        // 🏠 MARKET, SHOPPING & TRANSPORT
        { eg: "بكام ده يا باشا؟ (Bikam da ya basha?)", en: "How much is this, sir?", cat: "shopping", lvl: "Beginner" },
        { eg: "آخر كلام كام؟ (Aakhir kalam kam?)", en: "What is your final best price?", cat: "shopping", lvl: "Intermediate" },
        { eg: "غالي قوي، خفض شوية (Ghaali awi, khaft shwaya)", en: "Too expensive, lower the price a bit!", cat: "shopping", lvl: "Beginner" },
        { eg: "على جنب يا اسطى هنا (Ala gamb ya osta hena)", en: "Drop me off right here driver!", cat: "shopping", lvl: "Beginner" },
        { eg: "محطة مترو أنفاق (Mahattat metro anfaq)", en: "Subway/Metro station", cat: "shopping", lvl: "Beginner" },
        { eg: "عايز تذكرتين للمترو (Ayiz tazkarteen lel-metro)", en: "I want two metro tickets.", cat: "shopping", lvl: "Beginner" },
        { eg: "الميكروباص ده رايح رمسيس؟ (El-microbus da rayeh Ramses?)", en: "Is this microbus going to Ramses Square?", cat: "shopping", lvl: "Intermediate" },
        { eg: "شغل العداد يا فندم (Shaggal el-addad ya fandim)", en: "Please turn on the taxi meter, sir.", cat: "shopping", lvl: "Intermediate" },
        { eg: "عندك خضار طازة؟ (Aandak khodar taza?)", en: "Do you have fresh vegetables?", cat: "shopping", lvl: "Beginner" },
        { eg: "هات كيلو طماطم (Hat kilo tamatem)", en: "Give me 1 kg of tomatoes.", cat: "shopping", lvl: "Beginner" },

        // 🏥 HEALTHCARE & HOSPITALS
        { eg: "بطني بتوجعني قوي (Batny betwg'any awi)", en: "My stomach hurts very much.", cat: "health", lvl: "Beginner" },
        { eg: "عندي صداع وسخونية (Aandy sda'a wa skhoneya)", en: "I have a headache and a fever.", cat: "health", lvl: "Beginner" },
        { eg: "أقرب صيدلية فين؟ (A'qrab saydaleya feen?)", en: "Where is the nearest pharmacy?", cat: "health", lvl: "Beginner" },
        { eg: "عايز مسكن للألم (Ayiz mosakken lel-alam)", en: "I need a painkiller.", cat: "health", lvl: "Beginner" },
        { eg: "مستشفى القصر العيني طوارئ (Mostashfa El-Qasr El-Ainy taware'a)", en: "Kasr Al-Ainy Emergency Hospital", cat: "health", lvl: "Intermediate" },
        { eg: "عندي حساسية من الدوا (Aandy hasaseya min el-dawa)", en: "I am allergic to this medication.", cat: "health", lvl: "Advanced" },
        { eg: "ممكن قياس ضغط الدم؟ (Momkin qeyas daght el-dam?)", en: "Can you measure my blood pressure?", cat: "health", lvl: "Intermediate" },

        // ⚖️ LEGAL SCRIPTS & POLICE INTERACTION
        { eg: "أنا طالب حماية دولية (Ana taleb hemaya dawleya)", en: "I am seeking international refugee protection.", cat: "legal", lvl: "Advanced" },
        { eg: "محتاج محامي حقوقي (Mehtaaj mohamy hoqoqy)", en: "I need a human rights legal aid lawyer.", cat: "legal", lvl: "Advanced" },
        { eg: "معايا خطة المساعدة القانونية StARS (Ma'aya khetat el-mosa'ada el-qanooneya StARS)", en: "I am linked with StARS legal assistance.", cat: "legal", lvl: "Advanced" },
        { eg: "اتصل بمكتب المساعدة القانونية (Ettasil be-maktab el-mosa'ada el-qanooneya)", en: "Call the legal assistance hotline.", cat: "legal", lvl: "Intermediate" },

        // 💬 CULTURAL ETIQUETTE & GREETINGS
        { eg: "صباح الفل يا غالي (Sabah el-ful ya ghaali)", en: "Beautiful morning, my friend!", cat: "culture", lvl: "Beginner" },
        { eg: "مساء القشطة (Masaa el-qishta)", en: "Lovely evening!", cat: "culture", lvl: "Beginner" },
        { eg: "ربنا يخليك ويبارك فيك (Rabbena yekhalleek wa yebarek feek)", en: "May God bless & keep you!", cat: "culture", lvl: "Beginner" },
        { eg: "تسلم إيدك (Teslam eedak)", en: "Bless your hands! (Thank you for food/work)", cat: "culture", lvl: "Beginner" },
        { eg: "بالهنا والشفا (Bel-hana wal-shefa)", en: "Bon appétit / Enjoy your meal!", cat: "culture", lvl: "Beginner" },
        { eg: "نورت مصر يا طيب (Nawwart Masr ya tayyib)", en: "You have brightened Egypt, kind friend!", cat: "culture", lvl: "Beginner" }
    ];

    const phrasesGrid = document.getElementById('phrases-library-grid');
    const phraseCategoryChips = document.getElementById('phrase-category-chips');
    const phraseSearchInput = document.getElementById('phrase-library-search');

    async function loadPhrasesLibrary() {
        try {
            const response = await fetchLearningAsset('/data/phrases_45.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!Array.isArray(data.phrases) || data.phrases.length !== 45) throw new Error('Phrase dataset is incomplete');
            phrasesLibraryData.splice(0, phrasesLibraryData.length, ...data.phrases);
            renderPhrasesLibraryUI();
        } catch (error) {
            console.warn('Phrase dataset unavailable; keeping the checked-in source list.', error);
        }
    }

    function renderPhrasesLibraryUI(selectedCat = 'all', searchQuery = '') {
        if (!phrasesGrid) return;
        phrasesGrid.innerHTML = '';

        let filtered = phrasesLibraryData;
        if (selectedCat !== 'all') {
            filtered = filtered.filter(p => p.cat === selectedCat);
        }
        if (searchQuery.trim().length > 0) {
            const q = searchQuery.toLowerCase().trim();
            const lang = getSelectedLanguage();
            filtered = filtered.filter(p => p.eg.toLowerCase().includes(q) || (lang === 'en' ? p.en.toLowerCase().includes(q) : Boolean(p[`translation_${lang}`]) && p[`translation_${lang}`].toLowerCase().includes(q)));
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '12px 14px';
            card.style.margin = '0';
            card.style.background = 'var(--bg-dark)';
            card.style.border = '1px solid var(--glass-border)';

            const safeEg = item.eg.replace(/'/g, "\\'");
            const selectedLanguage = getSelectedLanguage();
            const selectedPhraseTranslation = selectedLanguage === 'en'
                ? item.en
                : selectedLanguage === 'ar'
                    ? ''
                    : item[`translation_${selectedLanguage}`] || '';
            const localizedCategory = selectedLanguage === 'en'
                ? item.cat
                : selectedLanguage === 'ar'
                    ? item.cat
                    : item[`category_${selectedLanguage}`] || '';
            const localizedLevel = selectedLanguage === 'en'
                ? item.lvl
                : selectedLanguage === 'ar'
                    ? item.lvl
                    : item[`level_${selectedLanguage}`] || '';
            card.innerHTML = `
                <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6px;">
                    <span class="tag" style="font-size: 9px; padding: 2px 6px; border-color: var(--warm-sand); color: var(--warm-sand);">${escapeHtml(localizedCategory)} · ${escapeHtml(localizedLevel)}</span>
                    <button class="icon-btn" onclick="speakText('${safeEg}', 'ar-EG')" title="Listen Egyptian Audio" style="padding: 4px;">
                        <i class="fa-solid fa-volume-high" style="color: var(--warm-sand); font-size: 13px;"></i>
                    </button>
                </div>
                <strong style="font-size: 15px; color: #fff; display: block; margin-bottom: 4px;">${escapeHtml(item.eg)}</strong>
                ${selectedPhraseTranslation ? `<p style="font-size: 12px; color: var(--emerald); margin: 0; line-height: 1.4;">${escapeHtml(selectedPhraseTranslation)}</p>` : ''}
            `;
            phrasesGrid.appendChild(card);
        });
    }

    loadPhrasesLibrary();

    if (phraseCategoryChips) {
        phraseCategoryChips.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                phraseCategoryChips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const cat = btn.getAttribute('data-cat');
                const query = phraseSearchInput ? phraseSearchInput.value : '';
                renderPhrasesLibraryUI(cat, query);
            });
        });
    }

    if (phraseSearchInput) {
        phraseSearchInput.addEventListener('input', (e) => {
            const activeBtn = phraseCategoryChips ? phraseCategoryChips.querySelector('.chip-btn.active') : null;
            const cat = activeBtn ? activeBtn.getAttribute('data-cat') : 'all';
            renderPhrasesLibraryUI(cat, e.target.value);
        });
    }

    renderPhrasesLibraryUI('all', '');

    // -------------------------------------------------------------
    // DUOLINGO DUAL-TRACK GAMIFIED LEARNING ENGINE (600 REAL LESSONS)
    // -------------------------------------------------------------
    let currentTrack = 'dialect'; // 'dialect' or 'culture'
    let cultureLessonsData = [];
    let dialectLessons600 = [];
    let currentLessonOffset = 1;
    const learningDataState = { dialect: 'loading', culture: 'loading' };

    function updateLearningDatasetUI() {
        const dialectCount = document.getElementById('dialect-lessons-count');
        const cultureCount = document.getElementById('culture-lessons-count');
        const cultureStatus = document.getElementById('culture-track-status');
        const jumpInput = document.getElementById('lesson-jump-input');
        const dialectLabel = document.getElementById('track-dialect-label');
        const cultureLabel = document.getElementById('track-culture-label');
        const streakLabel = document.getElementById('user-streak-label');
        const dialectTotal = dialectLessons600.length;
        const cultureTotal = cultureLessonsData.length;

        if (dialectCount) dialectCount.textContent = dialectTotal || 'Unavailable';
        if (cultureCount) cultureCount.textContent = cultureTotal || 'Unavailable';
        if (jumpInput) jumpInput.max = currentTrack === 'dialect' ? dialectTotal : cultureTotal;
        if (dialectLabel) dialectLabel.innerHTML = `${escapeHtml(getLanguageRuntimeText('trackDialect'))} (${dialectTotal || '—'} ${escapeHtml(getLanguageRuntimeText('lessonsLabel', getSelectedLanguage()))})`;
        if (cultureLabel) cultureLabel.innerHTML = `${escapeHtml(getLanguageRuntimeText('trackCulture'))} (${cultureTotal || '—'} ${escapeHtml(getLanguageRuntimeText('lessonsLabel', getSelectedLanguage()))})`;
        if (streakLabel) streakLabel.textContent = getLanguageRuntimeText('daysLabel');
        if (cultureStatus) {
            cultureStatus.innerHTML = cultureTotal
                ? `<i class="fa-solid fa-database"></i> ${escapeHtml(getLanguageRuntimeText('datasetAvailable'))}`
                : `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(getLanguageRuntimeText('datasetUnavailable'))}`;
            cultureStatus.style.borderColor = cultureTotal ? 'var(--emerald)' : 'var(--coral)';
            cultureStatus.style.color = cultureTotal ? 'var(--emerald)' : 'var(--coral)';
        }
        const titleEl = document.getElementById('current-track-title');
        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-route text-gold"></i> <span>${escapeHtml(getLearningTrackTitle(currentTrack))}</span>`;
    }

    async function loadLearningDataset(path, key) {
        try {
            const res = await fetchLearningAsset(path);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data.lessons) || data.lessons.length === 0) throw new Error('Dataset contains no lessons');
            if (key === 'dialect') dialectLessons600 = data.lessons;
            else cultureLessonsData = data.lessons;
            learningDataState[key] = 'ready';
            updateLearningDatasetUI();
            renderDuolingoSnakePath();
            console.log(`Loaded ${data.lessons.length} ${key} lessons from ${path}.`);
        } catch (e) {
            learningDataState[key] = 'unavailable';
            updateLearningDatasetUI();
            renderDuolingoSnakePath();
            console.warn(`Failed to load ${path}:`, e);
        }
    }

    loadLearningDataset('/data/dialect_lessons_600.json', 'dialect');
    loadLearningDataset('/data/culture_lessons_100.json', 'culture');

    // Jump to Lesson Listener
    const btnJump = document.getElementById('btn-jump-lesson');
    const inputJump = document.getElementById('lesson-jump-input');
    if (btnJump && inputJump) {
        btnJump.addEventListener('click', () => {
            const targetLesson = parseInt(inputJump.value);
            const maxLesson = currentTrack === 'dialect' ? dialectLessons600.length : cultureLessonsData.length;
            if (targetLesson >= 1 && targetLesson <= maxLesson) {
                currentLessonOffset = targetLesson;
                renderDuolingoSnakePath();
            }
        });
    }

    // Track Switcher Buttons
    const btnTrackDialect = document.getElementById('btn-track-dialect');
    const btnTrackCulture = document.getElementById('btn-track-culture');
    const trackTitle = document.getElementById('current-track-title');

    if (btnTrackDialect && btnTrackCulture) {
        btnTrackDialect.addEventListener('click', () => {
            currentTrack = 'dialect';
            btnTrackDialect.classList.add('active');
            btnTrackCulture.classList.remove('active');
            currentLessonOffset = 1;
            if (trackTitle) trackTitle.innerHTML = `<i class="fa-solid fa-route text-gold"></i> <span>${escapeHtml(getLearningTrackTitle('dialect'))}</span>`;
            renderDuolingoSnakePath();
        });

        btnTrackCulture.addEventListener('click', () => {
            currentTrack = 'culture';
            btnTrackCulture.classList.add('active');
            btnTrackDialect.classList.remove('active');
            currentLessonOffset = 1;
            if (trackTitle) trackTitle.innerHTML = `<i class="fa-solid fa-route text-gold"></i> <span>${escapeHtml(getLearningTrackTitle('culture'))}</span>`;
            renderDuolingoSnakePath();
        });
    }

    // Helper to get completed lesson IDs from localStorage
    function getCompletedDialectLessons() {
        try {
            return JSON.parse(localStorage.getItem('saleem_completed_dialect_lessons') || '[]');
        } catch (e) {
            return [];
        }
    }

    function getCompletedCultureLessons() {
        try {
            return JSON.parse(localStorage.getItem('saleem_completed_culture_lessons') || '[]');
        } catch (e) {
            return [];
        }
    }

    function updateLocalLearningStats() {
        const dialectCompleted = getCompletedDialectLessons();
        const cultureCompleted = getCompletedCultureLessons();
        const wordsLearned = dialectCompleted.reduce((total, id) => {
            const lesson = dialectLessons600.find(item => Number(item.id) === Number(id));
            return total + (lesson && Array.isArray(lesson.words) ? lesson.words.length : 0);
        }, 0);
        const phrasesMastered = wordsLearned;
        const xp = parseInt(localStorage.getItem('saleem_user_xp') || '0');
        const level = xp >= 1000 ? ['3', 'Advanced'] : xp >= 500 ? ['2', 'Intermediate'] : ['1', 'Beginner'];
        const wordsEl = document.getElementById('stat-words-learned');
        const phrasesEl = document.getElementById('stat-phrases-mastered');
        const streakEl = document.getElementById('stat-streak-days');
        const levelEl = document.getElementById('stat-level');
        const levelLabelEl = document.getElementById('stat-level-label');
        if (wordsEl) wordsEl.textContent = String(wordsLearned);
        if (phrasesEl) phrasesEl.textContent = String(phrasesMastered);
        if (streakEl) streakEl.textContent = `🔥 ${parseInt(localStorage.getItem('saleem_user_streak') || '0')} ${getLanguageRuntimeText('daysLabel')}`;
        if (levelEl) levelEl.textContent = `${getSelectedLanguage() === 'en' ? 'Level' : 'المستوى'} ${level[0]}`;
        if (levelLabelEl) levelLabelEl.textContent = level[1];
        return cultureCompleted.length;
    }

    function getLearningTrackTitle(track, lang = getSelectedLanguage()) {
        const count = track === 'dialect' ? dialectLessons600.length : cultureLessonsData.length;
        const label = getLearningUiText(track === 'dialect' ? 'progressionDialect' : 'progressionCulture', lang);
        return `${label} (${count || getLearningUiText('unavailable', lang)} ${getLearningUiText('lessons', lang)})`;
    }

    function getLocalizedLessonTitle(lesson, id, lang = getSelectedLanguage()) {
        if (lang === 'en') return lesson.title_en || `${getLearningUiText('lesson', lang)} ${id}`;
        if (lang === 'ar') return lesson.title_ar || `${getLearningUiText('lesson', lang)} ${id}`;
        return `${getLearningUiText('lesson', lang)} ${id}`;
    }

    // Render Duolingo Curved Snake Path for 600 Lessons (Zero Initial State)
    function renderDuolingoSnakePath() {
        const container = document.getElementById('duolingo-snake-view');
        if (!container) return;

        let html = '';
        const userXP = parseInt(localStorage.getItem('saleem_user_xp') || '0');
        const userStreak = parseInt(localStorage.getItem('saleem_user_streak') || '0');
        const completed = currentTrack === 'dialect' ? getCompletedDialectLessons() : getCompletedCultureLessons();
        const lessons = currentTrack === 'dialect' ? dialectLessons600 : cultureLessonsData;
        const totalLessons = lessons.length;
        const visibleCount = Math.min(15, totalLessons);

        if (!totalLessons) {
            const state = learningDataState[currentTrack];
            container.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted);">${state === 'loading' ? escapeHtml(getLanguageRuntimeText('loadingDataset')) : escapeHtml(getLanguageRuntimeText('datasetUnavailable'))}</div>`;
            updateLearningDatasetUI();
            return;
        }

        if (totalLessons > 0) {
            const startLesson = Math.max(1, Math.min(totalLessons - visibleCount + 1, currentLessonOffset));
            const endLesson = Math.min(totalLessons, startLesson + visibleCount - 1);

            for (let i = startLesson; i <= endLesson; i++) {
                let statusClass = 'locked';
                let iconClass = 'fa-lock';
                let isClickable = false;

                const isCompleted = completed.includes(i);
                const isPrevCompleted = (i === 1) || completed.includes(i - 1);

                if (isCompleted) {
                    statusClass = 'completed';
                    iconClass = 'fa-check';
                    isClickable = true;
                } else if (isPrevCompleted) {
                    statusClass = 'active';
                    iconClass = currentTrack === 'dialect' ? 'fa-comments' : 'fa-landmark';
                    isClickable = true;
                }

                const offsets = ['0px', '70px', '120px', '70px', '0px', '-70px', '-120px', '-70px', '0px', '60px'];
                const offsetLeft = offsets[(i - 1) % offsets.length];
                const openHandler = currentTrack === 'dialect' ? `openDialectLessonModal(${i})` : `openCultureLessonModal(${i})`;
                const clickHandler = isClickable ? `onclick="${openHandler}"` : `onclick="alert('Complete the previous lesson first to unlock this lesson.')"`;
                const lesson = lessons.find(item => Number(item.id) === i);
                if (!lesson) continue;
                const title = escapeHtml(getLocalizedLessonTitle(lesson, i));

                html += `
                    <div class="duolingo-snake-node ${statusClass}" style="transform: translateX(${offsetLeft});" ${clickHandler}>
                        <i class="fa-solid ${iconClass}"></i>
                        <span class="node-label">${title}</span>
                    </div>
                `;
            }
        } else {
            // Culture Lessons Locked (Unlocks in 72 Days)
            html = `
                <div style="text-align: center; padding: 40px 20px; background: rgba(15, 23, 42, 0.85); border: 2px solid var(--coral); border-radius: 20px; max-width: 580px; margin: 10px auto; box-shadow: 0 10px 30px rgba(244, 63, 94, 0.2);">
                    <div style="font-size: 50px; margin-bottom: 10px;">🔒</div>
                    <h2 style="font-size: 22px; color: var(--warm-sand); margin-bottom: 6px;">Track 2: Egyptian Culture Track Locked</h2>
                    <h3 style="font-size: 17px; color: var(--coral); margin-bottom: 16px;">مسار الثقافة المصرية مغلق حالياً وسيطرح بعد 72 يوماً</h3>
                    <p style="font-size: 14px; color: var(--text-light); line-height: 1.6; margin-bottom: 20px;">
                        This track will unlock in <strong>72 days</strong> after building your core Egyptian dialect vocabulary in Track 1.<br>
                        <span style="color: var(--text-muted); font-size: 13px;">سيتم فتح هذا المسار تلقائياً بعد 72 يوماً لإتاحة القصص الثقافية والمواقف الاجتماعية.</span>
                    </p>
                    <div style="padding: 12px 20px; background: rgba(244, 63, 94, 0.15); border-radius: 12px; border: 1px solid var(--coral); display: inline-block;">
                        <strong style="color: var(--coral); font-size: 15px;"><i class="fa-solid fa-hourglass-half text-gold"></i> Unlocks in: 72 Days / متبقي 72 يوماً للفتح</strong>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

        const trackTitle = document.getElementById('current-track-title');
        if (trackTitle) {
            trackTitle.innerHTML = `<i class="fa-solid fa-route text-gold"></i> <span>${escapeHtml(getLearningTrackTitle(currentTrack))}</span>`;
        }
        updateLearningDatasetUI();

        // Update streak & XP displays
        const streakEl = document.getElementById('user-streak-count');
        const xpEl = document.getElementById('user-xp-count');
        if (streakEl) streakEl.innerText = userStreak;
        if (xpEl) xpEl.innerText = userXP.toLocaleString();

        updateLocalLearningStats();
        renderRealLeaderboard();
    }

    // Render Real Dynamic Leaderboard (No Fake Users)
    function renderRealLeaderboard() {
        const body = document.getElementById('leaderboard-body');
        if (!body) return;

        const userXP = parseInt(localStorage.getItem('saleem_user_xp') || '0');
        const userStreak = parseInt(localStorage.getItem('saleem_user_streak') || '0');
        const userName = localStorage.getItem('saleem_user_name') || 'Amina Hassan';
        const userNat = localStorage.getItem('saleem_user_nationality') || 'Sudan';

        if (userXP === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
                        <i class="fa-solid fa-trophy" style="font-size: 24px; color: var(--warm-sand); display: block; margin-bottom: 8px;"></i>
                        ${escapeHtml(getLanguageRuntimeText('noLessons'))}
                    </td>
                </tr>
            `;
            return;
        }

        let badge = 'Dialect Learner';
        if (userXP >= 1000) badge = 'Dialect Legend';
        else if (userXP >= 500) badge = 'Cairo Explorer';
        else if (userXP >= 200) badge = 'Street Wise';

        body.innerHTML = `
            <tr>
                <td><span class="rank-badge rank-1">1</span></td>
                <td><strong>${escapeHtml(userName)}</strong> (${getSelectedLanguage() === 'en' ? 'You' : 'أنت'})</td>
                <td>🇸🇩 ${userNat}</td>
                <td><strong style="color: var(--warm-sand);">${userXP.toLocaleString()} XP</strong></td>
                <td>🔥 ${userStreak} ${escapeHtml(getLanguageRuntimeText('daysLabel'))}</td>
                <td><span class="tag" style="border-color: var(--warm-sand); color: var(--warm-sand);">${badge}</span></td>
            </tr>
        `;
    }

    // Resolve only records from the checked-in dataset. Missing content stays missing.
    function getOrGenerateDialectLesson(lessonId) {
        if (dialectLessons600 && dialectLessons600.length > 0) {
            const found = dialectLessons600.find(l => Number(l.id) === Number(lessonId));
            if (found) return found;
        }

        return null;

        if (false) {
        const defaultWords = [
            { word: "إزيك يا باشا", pronunciation: "Izayyak ya basha", english: "How are you sir?", meaning: "اصطلاح تحية محترم", example: "إزيك يا باشا عامل إيه؟", category: "common" },
            { word: "على جنب يا اسطى", pronunciation: "Ala gamb ya osta", english: "Pull over driver please", meaning: "عبارة مواصلات أساسية", example: "على جنب يا اسطى هنا من فضلك.", category: "transport" },
            { word: "قشطة وزي الفل", pronunciation: "Ashta w zai el-fol", english: "Awesome and super fine", meaning: "تعبير استحسان مصري", example: "كل حاجة قشطة وزي الفل.", category: "slang" },
            { word: "خلصانة بشياكة", pronunciation: "Khalsana b sheyaka", english: "It's a deal in style!", meaning: "اتفاق بكرامة وود", example: "البيعة خلصانة بشياكة.", category: "slang" },
            { word: "ربنا يخليك ويحفظك", pronunciation: "Rabbena yekhalik", english: "May God preserve you", meaning: "دعاء شكر وامتنان", example: "شكراً جداً وربنا يخليك ويحفظك.", category: "expression" },
            { word: "بكام ده يا معلم", pronunciation: "Bikam dah ya ma'allem", english: "How much is this?", meaning: "عبارة فصال في السوق", example: "بكام ده يا معلم في السوق؟", category: "shopping" },
            { word: "تسلم إيدك", pronunciation: "Teslam idak", english: "Well done / Great job", meaning: "ثناء على عمل طيب", example: "الأكل ممتاز وتسلم إيدك.", category: "expression" },
            { word: "ألف سلامة عليك", pronunciation: "Alf salama 'aleik", english: "Get well soon", meaning: "دعاء للمريض بالشفاء", example: "ألف سلامة عليك وشفاك الله.", category: "health" },
            { word: "منور يا كبير", pronunciation: "Menawwar ya kabeer", english: "You brighten the place boss", meaning: "ترحيب حار بالضيف", example: "أهلاً بيك ومنور يا كبير.", category: "common" },
            { word: "على راسي من فوق", pronunciation: "Ala rasi men foq", english: "With my pleasure / My honor", meaning: "تعبير عن فائق الاحترام", example: "طلبك على راسي من فوق.", category: "expression" }
        ];

        const questions = [];
        defaultWords.forEach((w) => {
            const options1 = [w.english, "Good night", "Where is the station?", "Thank you very much"];
            questions.push({
                question: `ما معنى الكلمة أو العبارة المصرية: '${w.word}'؟`,
                options: options1,
                answer: 0,
                explanation: `عبارة '${w.word}' تعني بالإنجليزي: '${w.english}' (النطق: ${w.pronunciation}).`
            });

            const options2 = [w.word, "مساء الخير", "مع السلامة", "صباح الخير"];
            questions.push({
                question: `اختر العبارة المصرية المناسبة للترجمة: '${w.english}'`,
                options: options2,
                answer: 0,
                explanation: `الترجمة الدقيقة لـ '${w.english}' هي: '${w.word}'.`
            });
        });

        return {
            id: lessonId,
            title_ar: `الدرس ${lessonId}: المفردات اليومية (10 كلمات)`,
            title_en: `Lesson ${lessonId}: Daily Vocabulary (10 Words)`,
            words: defaultWords,
            questions: questions
        };
        }
    }

    // -------------------------------------------------------------
    // INTERACTIVE 2-STEP DUOLINGO LESSON (10 WORDS + 20 QUIZ QUESTIONS)
    // -------------------------------------------------------------
    let activeLessonState = {
        lessonId: 1,
        words: [],
        questions: [],
        wordIdx: 0,
        quizIdx: 0,
        score: 0
    };
    let activeCultureLessonId = null;

    window.openDialectLessonModal = function(lessonId) {
        const modal = document.getElementById('dialect-modal');
        const content = document.getElementById('dialect-modal-content');
        if (!modal || !content) return;

        const lesson = dialectLessons600.find(item => Number(item.id) === Number(lessonId));
        if (!lesson || !Array.isArray(lesson.words) || !Array.isArray(lesson.questions) || lesson.words.length === 0 || lesson.questions.length === 0) {
            content.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-muted);">This lesson has no complete dataset record yet. No replacement content was generated.</div>';
            modal.style.display = 'flex';
            return;
        }

        activeLessonState = {
            lessonId: lesson.id,
            words: lesson.words || [],
            questions: lesson.questions || [],
            wordIdx: 0,
            quizIdx: 0,
            score: 0
        };

        renderLessonWordStep();
        modal.style.display = 'flex';
    };

    // Multilingual Adaptation Engine for Lessons & Quizzes
    function getMultilingualLessonText(key, params = {}) {
        const lang = localStorage.getItem('saleem_app_language') || localStorage.getItem('saleem_user_language') || 'en';

        const translations = {
            en: {
                step1_header: `Lesson ${params.lessonId}: Step 1 - Study Words (${params.wordIdx + 1} / 10)`,
                word_count: `Word ${params.wordIdx + 1} of 10`,
                spoken_pron: `🗣️ Spoken Pronunciation:`,
                meaning_label: `Meaning in Your Selected Language:`,
                usage_example: `Real Usage Example:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> Previous Word`,
                next_word: `Next Word <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `Start 20-Question Practice Quiz <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `Lesson ${params.lessonId}: Step 2 - 20 Practice Questions`,
                question_count: `Question ${params.quizIdx + 1} of 20`,
                q1_text: `What is the meaning of the Egyptian Arabic phrase: '${params.word}'?`,
                q2_text: `Select the correct Egyptian Arabic phrase for: '${params.english}'`,
                explanation_text: `'${params.word}' in Egyptian Arabic means: '${params.english}' (Spoken pronunciation: ${params.pron}).`,
                correct_ans: `🎉 Correct Answer! (+10 XP)`,
                incorrect_ans: `❌ Incorrect! Try again.`,
                next_q: `Next Question <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `Congratulations! Lesson ${params.lessonId} Mastered!`,
                summary_sub: `You studied 10 real Egyptian words and answered 20 practice questions in your language.`,
                score_label: `Quiz Score`,
                xp_label: `XP Awarded`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> Continue & Unlock Next Lesson`
            },
            am: {
                step1_header: `ትምህርት ${params.lessonId}: ደረጃ 1 - ቃላትን ማጥናት (${params.wordIdx + 1} / 10)`,
                word_count: `ቃል ${params.wordIdx + 1} ከ 10`,
                spoken_pron: `🗣️ የሚነበብበት መንገድ:`,
                meaning_label: `በመረጡት ቋንቋ ትርጉም:`,
                usage_example: `የእውነተኛ አጠቃቀም ምሳሌ:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> የቀደመው ቃል`,
                next_word: `ቀጣይ ቃል <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `የ 20 ጥያቄዎች ልምምድ ጀምር <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `ትምህርት ${params.lessonId}: ደረጃ 2 - 20 የልምምድ ጥያቄዎች`,
                question_count: `ጥያቄ ${params.quizIdx + 1} ከ 20`,
                q1_text: `የግብፅ ዓረብኛ ቃል ትርጉም ምንድን ነው: '${params.word}'?`,
                q2_text: `ለዚህ ትርጉም ትክክለኛውን የግብፅ ቃል ይምረጡ: '${params.english}'`,
                explanation_text: `'${params.word}' በግብፅ ዓረብኛ ማለት: '${params.english}' ማለት ነው (የአነባበብ ቋንቋ: ${params.pron})።`,
                correct_ans: `🎉 ትክክለኛ መልስ! (+10 XP)`,
                incorrect_ans: `❌ ስህተት! እንደገና ይሞክሩ።`,
                next_q: `ቀጣይ ጥያቄ <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `እንኳን ደስ አለዎት! ትምህርት ${params.lessonId} ተጠናቋል!`,
                summary_sub: `10 የግብፅ ቃላትን አጥንተው 20 ጥያቄዎችን በቋንቋዎ መልሰዋል።`,
                score_label: `የፈተና ውጤት`,
                xp_label: `የተሸለሙት XP`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> ቀጥል እና የሚቀጥለውን ትምህርት ክፈት`
            },
            so: {
                step1_header: `Casharka ${params.lessonId}: Tallaabada 1 - Barashada Erayada (${params.wordIdx + 1} / 10)`,
                word_count: `Erayga ${params.wordIdx + 1} ee 10`,
                spoken_pron: `🗣️ Ku dhawaaqida:`,
                meaning_label: `Macnaha luqaddaada:`,
                usage_example: `Tusaalaha isticmaalka dhabta ah:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> Eraygii Hore`,
                next_word: `Erayga Xiga <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `Biloow Imtixaanka 20ka Su'aalood <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `Casharka ${params.lessonId}: Tallaabada 2 - 20 Su'aalood`,
                question_count: `Su'aasha ${params.quizIdx + 1} ee 20`,
                q1_text: `Maxay ka dhigan tahay kelmada Masariga ah: '${params.word}'?`,
                q2_text: `Dooro kelmada Masariga ah ee u dhiganta: '${params.english}'`,
                explanation_text: `'${params.word}' af-Masari waxay ka dhigan tahay: '${params.english}' (Ku dhawaaqida: ${params.pron}).`,
                correct_ans: `🎉 Jawaab Sahiih ah! (+10 XP)`,
                incorrect_ans: `❌ Qaldan! Dob u baro.`,
                next_q: `Su'aasha Xigta <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `Hambalyo! Waxaad dhamaysay Casharka ${params.lessonId}!`,
                summary_sub: `Waxaad baratay 10 eray oo Masari ah waxaanad ka jawaabtay 20 su'aalood.`,
                score_label: `Dhibcaha Imtixaanka`,
                xp_label: `XP-ga la helay`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> Sii wad oo fur Casharka Xiga`
            },
            ti: {
                step1_header: `ትምህርቲ ${params.lessonId}: ደረጃ 1 - ቃላት ምምሃር (${params.wordIdx + 1} / 10)`,
                word_count: `ቃል ${params.wordIdx + 1} ካብ 10`,
                spoken_pron: `🗣️ ኣነባብባ:`,
                meaning_label: `ትርጉም ብቋንቋኹም:`,
                usage_example: `ኣብ ሓቀኛ ህይወት ኣጠቓቕማ:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> ዝሓለፈ ቃል`,
                next_word: `ዝቕጽል ቃል <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `ናይ 20 ሕቶታት ፈተና ጀምር <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `ትምህርቲ ${params.lessonId}: ደረጃ 2 - 20 ሕቶታት`,
                question_count: `ሕቶ ${params.quizIdx + 1} ካብ 20`,
                q1_text: `ናይ ግብጺ ዓረብኛ ቃል ትርጉም እንታይ እዩ: '${params.word}'?`,
                q2_text: `ነዚ ትርጉም ዝኸውን ናይ ግብጺ ቃል ሕረዩ: '${params.english}'`,
                explanation_text: `'${params.word}' ብግብጺ ዓረብኛ ማለት: '${params.english}' እዩ።`,
                correct_ans: `🎉 ቅኑዕ መልሲ! (+10 XP)`,
                incorrect_ans: `❌ ጌጋ! እንደገና ፈትኑ።`,
                next_q: `ዝቕጽል ሕቶ <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `እንኳዕ ደስበለኩም! ትምህርቲ ${params.lessonId} ተወዲኡ!`,
                summary_sub: `10 ናይ ግብጺ ቃላት ተመሂርኩም 20 ሕቶታት መሊስኩም።`,
                score_label: `ውጽኢት ፈተና`,
                xp_label: `ዝተረኽበ XP`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> ቀጽሉን ዝቕጽል ትምህርቲ ኸፍቱን`
            },
            fr: {
                step1_header: `Leçon ${params.lessonId} : Étape 1 - Étudier les mots (${params.wordIdx + 1} / 10)`,
                word_count: `Mot ${params.wordIdx + 1} sur 10`,
                spoken_pron: `🗣️ Prononciation parlée :`,
                meaning_label: `Signification dans votre langue :`,
                usage_example: `Exemple d'utilisation réelle :`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> Mot précédent`,
                next_word: `Mot suivant <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `Commencer le quiz de 20 questions <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `Leçon ${params.lessonId} : Étape 2 - Quiz de 20 questions`,
                question_count: `Question ${params.quizIdx + 1} sur 20`,
                q1_text: `Que signifie l'expression égyptienne : '${params.word}' ?`,
                q2_text: `Sélectionnez la phrase égyptienne correcte pour : '${params.english}'`,
                explanation_text: `'${params.word}' en arabe égyptien signifie : '${params.english}' (Prononciation : ${params.pron}).`,
                correct_ans: `🎉 Bonne réponse ! (+10 XP)`,
                incorrect_ans: `❌ Incorrect ! Réessayez.`,
                next_q: `Question suivante <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `Félicitations ! Leçon ${params.lessonId} maîtrisée !`,
                summary_sub: `Vous avez étudié 10 mots égyptiens réels et répondu à 20 questions de pratique.`,
                score_label: `Score du quiz`,
                xp_label: `XP attribués`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> Continuer et débloquer la leçon suivante`
            },
            sw: {
                step1_header: `Somo la ${params.lessonId}: Hatua ya 1 - Jifunze Maneno (${params.wordIdx + 1} / 10)`,
                word_count: `Neno la ${params.wordIdx + 1} kati ya 10`,
                spoken_pron: `🗣️ Matamshi ya kusema:`,
                meaning_label: `Maana katika lugha yako:`,
                usage_example: `Mfano wa matumizi halisi:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> Neno lililopita`,
                next_word: `Neno linalofuata <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `Anza Maswali 20 ya Mazoezi <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `Somo la ${params.lessonId}: Hatua ya 2 - Maswali 20`,
                question_count: `Swali la ${params.quizIdx + 1} kati ya 20`,
                q1_text: `Nini maana ya neno la Kiarabu cha Misri: '${params.word}'?`,
                q2_text: `Chagua neno sahihi la Kiarabu cha Misri kwa: '${params.english}'`,
                explanation_text: `'${params.word}' kwa Kiarabu cha Misri ina maana: '${params.english}' (Matamshi: ${params.pron}).`,
                correct_ans: `🎉 Jibu Sahihi! (+10 XP)`,
                incorrect_ans: `❌ Siyo sahihi! Jaribu tena.`,
                next_q: `Swali linalofuata <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `Hongera! Somo la ${params.lessonId} limekamilika!`,
                summary_sub: `Umejifunza maneno 10 ya Kiarabu cha Misri na kujibu maswali 20.`,
                score_label: `Alama za Jaribio`,
                xp_label: `XP Zilizopatikana`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> Endelea na Fungua Somo Linalofuata`
            },
            ha: {
                step1_header: `Darasi ${params.lessonId}: Mataki na 1 - Koyi Kalmomi (${params.wordIdx + 1} / 10)`,
                word_count: `Kalma ta ${params.wordIdx + 1} cikin 10`,
                spoken_pron: `Furucin magana:`,
                meaning_label: `Ma'ana a cikin harshenka:`,
                usage_example: `Misalin amfani na gaske:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> Kalmar baya`,
                next_word: `Kalma ta gaba <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `Fara tambayoyin atisaye 20 <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `Darasi ${params.lessonId}: Mataki na 2 - Tambayoyin atisaye 20`,
                question_count: `Tambaya ta ${params.quizIdx + 1} cikin 20`,
                q1_text: `Menene ma'anar kalmar Larabcin Masar: '${params.word}'?`,
                q2_text: `Zabi kalmar Larabcin Masar da ta dace da: '${params.english}'`,
                explanation_text: `'${params.word}' a Larabcin Masar na nufin: '${params.english}' (Furuci: ${params.pron}).`,
                correct_ans: `Amsa daidai! (+10 XP)`,
                incorrect_ans: `Ba daidai ba. Sake gwadawa.`,
                next_q: `Tambaya ta gaba <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `Taya murna! Ka kware a Darasi ${params.lessonId}!`,
                summary_sub: `Ka koyi kalmomin Masar guda 10 kuma ka amsa tambayoyin atisaye 20.`,
                score_label: `Sakamakon tambayoyi`,
                xp_label: `XP da aka samu`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> Ci gaba ka bude darasi na gaba`
            },
            om: {
                step1_header: `Barnoota ${params.lessonId}: Tarkaanfii 1 - Jechoota baradhu (${params.wordIdx + 1} / 10)`,
                word_count: `Jechoota ${params.wordIdx + 1} keessaa 10`,
                spoken_pron: `Akkaataa dubbii:`,
                meaning_label: `Hiika afaan keetii:`,
                usage_example: `Fakkeenya itti fayyadama dhugaa:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> Jecha darbe`,
                next_word: `Jecha itti aanu <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `Shaakala gaaffii 20 jalqabi <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `Barnoota ${params.lessonId}: Tarkaanfii 2 - Gaaffilee shaakalaa 20`,
                question_count: `Gaaffii ${params.quizIdx + 1} keessaa 20`,
                q1_text: `Hiikni jecha Arabiffaa Gibxii '${params.word}' maali?`,
                q2_text: `Jechoota Arabiffaa Gibxii sirrii kan '${params.english}' filadhu`,
                explanation_text: `'${params.word}' Afaan Arabaa Gibxiitiin jechuun: '${params.english}' (Dubbisa: ${params.pron}).`,
                correct_ans: `Deebii sirrii! (+10 XP)`,
                incorrect_ans: `Sirrii miti. Irra deebi'i.`,
                next_q: `Gaaffii itti aanu <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `Baga gammaddan! Barnoota ${params.lessonId} xumurteetta!`,
                summary_sub: `Jechoota Arabaa Gibxii 10 barattee gaaffilee shaakalaa 20 deebiste.`,
                score_label: `Qabxii qormaataa`,
                xp_label: `XP argame`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> Itti fufi, barnoota itti aanu bani`
            },
            ar: {
                step1_header: `الدرس ${params.lessonId}: الخطوة 1 - دراسة المفردات (${params.wordIdx + 1} / 10)`,
                word_count: `الكلمة ${params.wordIdx + 1} من 10`,
                spoken_pron: `🗣️ طريقة النطق:`,
                meaning_label: `المعنى باللغة المختارة:`,
                usage_example: `مثال الاستخدام الحقيقي:`,
                prev_word: `<i class="fa-solid fa-arrow-left"></i> الكلمة السابقة`,
                next_word: `الكلمة التالية <i class="fa-solid fa-arrow-right"></i>`,
                start_quiz: `ابدأ اختبار الـ 20 سؤالاً <i class="fa-solid fa-gamepad"></i>`,
                step2_header: `الدرس ${params.lessonId}: الخطوة 2 - 20 سؤالاً تفاعلياً`,
                question_count: `السؤال ${params.quizIdx + 1} من 20`,
                q1_text: `ما معنى الكلمة أو العبارة المصرية: '${params.word}'؟`,
                q2_text: `اختر العبارة المصرية المناسبة للترجمة: '${params.english}'`,
                explanation_text: `عبارة '${params.word}' تعني بالإنجليزي: '${params.english}' (النطق: ${params.pron}).`,
                correct_ans: `🎉 إجابة صحيحة وممتازة! (+10 XP)`,
                incorrect_ans: `❌ إجابة خاطئة! حاول مرة أخرى.`,
                next_q: `السؤال التالي <i class="fa-solid fa-arrow-right"></i>`,
                congrats: `تهانينا! تم إتقان الدرس ${params.lessonId} بنجاح!`,
                summary_sub: `درست 10 كلمات مصرية حقيقية وأجبت عن 20 سؤالاً تفاعلياً.`,
                score_label: `نتيجة الاختبار`,
                xp_label: `مكافأة XP`,
                continue_btn: `<i class="fa-solid fa-circle-check"></i> المتابعة وفتح الدرس التالي`
            }
        };

        const dict = translations[lang] || {};
        // Never expose English as a hidden third-language fallback. Egyptian
        // Arabic is the only permitted fallback when the selected UI language
        // has no lesson-control translation.
        return dict[key] || translations.ar[key] || getLanguageRuntimeText('translationUnavailable', lang);
    }

    function getLocalizedDialectWord(word, lang = getSelectedLanguage()) {
        if (lang === 'en' && word.english && word.example_english) {
            return { meaning: word.english, example: word.example_english };
        }
        if (lang === 'ar' && word.meaning && word.example) {
            return { meaning: word.meaning, example: word.example };
        }
        if (LANGUAGE_METADATA[lang] && lang !== 'en' && lang !== 'ar' && word[`meaning_${lang}`] && word[`example_${lang}`]) {
            return { meaning: word[`meaning_${lang}`], example: word[`example_${lang}`] };
        }
        return null;
    }

    function getLocalizedDialectQuestion(question, lang = getSelectedLanguage()) {
        if (lang === 'en' && question.question_en && Array.isArray(question.options)) {
            return { ...question, prompt: question.question_en, displayOptions: question.options, displayExplanation: question.explanation };
        }
        if (lang === 'ar' && question.question && Array.isArray(question.options)) {
            const word = dialectLessons600.flatMap(lesson => lesson.words || []).find(candidate => question.question.includes(`'${candidate.word}'`) || question.options[question.answer] === candidate.word);
            const displayOptions = question.options.map(option => {
                if (/[\u0600-\u06FF]/.test(option)) return option;
                const vocabularyMatch = dialectLessons600.flatMap(lesson => lesson.words || []).find(candidate => candidate.english === option);
                const phraseMatch = phrasesLibraryData.find(phrase => phrase.en === option);
                return vocabularyMatch?.meaning || phraseMatch?.eg || '\u063a\u064a\u0631 \u0645\u062a\u0627\u062d';
            });
            const displayExplanation = word
                ? `\u0639\u0628\u0627\u0631\u0629 '${word.word}' \u062a\u0639\u0646\u064a: '${word.meaning}' (\u0627\u0644\u0646\u0637\u0642: ${word.pronunciation}).`
                : question.explanation.replace(/\([^)]*\)/g, '').replace(/\u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a:\s*'[^']*'/g, '');
            return { ...question, prompt: question.question, displayOptions, displayExplanation };
        }
        if (LANGUAGE_METADATA[lang] && lang !== 'en' && lang !== 'ar' && question[`question_${lang}`] && Array.isArray(question[`options_${lang}`]) && question[`explanation_${lang}`]) {
            return {
                ...question,
                prompt: question[`question_${lang}`],
                displayOptions: question[`options_${lang}`],
                displayExplanation: question[`explanation_${lang}`]
            };
        }
        return null;
    }

    function renderTranslationUnavailable(container, detail = '') {
        if (!container) return;
        container.innerHTML = `
            <div style="text-align:center; padding:32px 20px; color:var(--text-muted);" dir="${LANGUAGE_METADATA[getSelectedLanguage()].dir}">
                <strong style="display:block; color:var(--warm-sand); margin-bottom:8px;">${escapeHtml(getLanguageRuntimeText('translationUnavailable'))}</strong>
                <span>${escapeHtml(detail || getLanguageRuntimeText('egyptianArabicOnly'))}</span>
            </div>
        `;
    }

    // Step 1: Render Word Flashcard (10 Words Step-by-Step) Multilingual
    function renderLessonWordStep() {
        const content = document.getElementById('dialect-modal-content');
        if (!content) return;

        const { lessonId, words, wordIdx } = activeLessonState;
        const currentWord = words[wordIdx];

        if (!currentWord) return;
        const selectedLanguage = getSelectedLanguage();
        const localizedWord = getLocalizedDialectWord(currentWord, selectedLanguage);
        if (!localizedWord) {
            renderTranslationUnavailable(content, getLanguageRuntimeText('coverageNotice', selectedLanguage));
            return;
        }

        content.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                <span class="tag" style="border-color: var(--emerald); color: var(--emerald); font-weight: bold;">
                    <i class="fa-solid fa-book-open"></i> ${getMultilingualLessonText('step1_header', { lessonId, wordIdx })}
                </span>
                <span style="font-size: 12px; color: var(--warm-sand); font-weight: bold;">${getMultilingualLessonText('word_count', { wordIdx })}</span>
            </div>

            <!-- Progress Bar -->
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 18px; overflow: hidden;">
                <div style="width: ${((wordIdx + 1) / 10) * 100}%; height: 100%; background: linear-gradient(90deg, var(--emerald), var(--warm-sand)); transition: width 0.3s ease;"></div>
            </div>

            <!-- Flashcard Card -->
            <div style="background: rgba(15, 23, 42, 0.8); border: 2px solid var(--emerald); border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 20px; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.25);">
                <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 10px;">
                    <h2 style="font-size: 28px; color: var(--warm-sand); margin: 0;">${currentWord.word}</h2>
                    <button class="btn btn-primary" style="padding: 8px 14px; border-radius: 50%; width: 44px; height: 44px; justify-content: center;" onclick="speakText('${currentWord.word.replace(/'/g, "\\'")}', 'ar-EG')">
                        <i class="fa-solid fa-volume-high" style="font-size: 18px;"></i>
                    </button>
                </div>

                <p style="font-size: 15px; color: var(--text-muted); margin-bottom: 14px;">${getMultilingualLessonText('spoken_pron')} <strong style="color: var(--text-light);">${currentWord.pronunciation}</strong></p>

                <div style="padding: 12px 16px; background: var(--surface-dark); border-radius: 12px; border: 1px solid var(--glass-border); margin-bottom: 14px;">
                    <span style="font-size: 11px; color: var(--emerald); display: block; text-transform: uppercase; font-weight: bold; margin-bottom: 4px;">${getMultilingualLessonText('meaning_label')}</span>
                    <strong style="font-size: 18px; color: var(--text-light);">${escapeHtml(localizedWord.meaning)}</strong>
                </div>

                <div style="padding: 10px 14px; background: rgba(232, 171, 99, 0.1); border-radius: 10px; border-left: 3px solid var(--warm-sand); text-align: left;">
                    <span style="font-size: 11px; color: var(--warm-sand); font-weight: bold; display: block;">${getMultilingualLessonText('usage_example')}</span>
                    <p style="font-size: 14px; color: var(--text-light); margin: 2px 0 0 0;">"${escapeHtml(localizedWord.example)}"</p>
                </div>
            </div>

            <!-- Action Controls -->
            <div style="display: flex; gap: 12px;">
                ${wordIdx > 0 ? `
                    <button class="btn btn-outline" style="flex: 1; justify-content: center; padding: 12px;" onclick="prevLessonWord()">
                        ${getMultilingualLessonText('prev_word')}
                    </button>
                ` : ''}
                <button class="btn btn-primary" style="flex: 2; justify-content: center; padding: 12px;" onclick="nextLessonWord()">
                    ${wordIdx < 9 ? getMultilingualLessonText('next_word') : getMultilingualLessonText('start_quiz')}
                </button>
            </div>
        `;
    }

    window.nextLessonWord = function() {
        if (activeLessonState.wordIdx < activeLessonState.words.length - 1) {
            activeLessonState.wordIdx++;
            renderLessonWordStep();
            return;
        }

        activeLessonState.quizIdx = 0;
        renderLessonQuizStep();
    };

    window.prevLessonWord = function() {
        if (activeLessonState.wordIdx > 0) {
            activeLessonState.wordIdx--;
            renderLessonWordStep();
        }
    };

    // Step 2: Render 20-Question Practice Quiz Multilingual
    function renderLessonQuizStep() {
        const content = document.getElementById('dialect-modal-content');
        if (!content) return;

        const { lessonId, questions, quizIdx } = activeLessonState;
        const q = questions[quizIdx];

        if (!q || quizIdx >= 20) {
            renderLessonCompleteSummary();
            return;
        }
        const localizedQuestion = getLocalizedDialectQuestion(q, getSelectedLanguage());
        if (!localizedQuestion) {
            renderTranslationUnavailable(content, getLanguageRuntimeText('coverageNotice'));
            return;
        }

        content.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <span class="tag" style="border-color: var(--warm-sand); color: var(--warm-sand); font-weight: bold;">
                    <i class="fa-solid fa-gamepad"></i> ${getMultilingualLessonText('step2_header', { lessonId })}
                </span>
                <span style="font-size: 12px; color: var(--emerald); font-weight: bold;">${getMultilingualLessonText('question_count', { quizIdx })}</span>
            </div>

            <!-- Progress Bar -->
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-bottom: 18px; overflow: hidden;">
                <div style="width: ${((quizIdx + 1) / 20) * 100}%; height: 100%; background: linear-gradient(90deg, var(--warm-sand), var(--emerald)); transition: width 0.3s ease;"></div>
            </div>

            <!-- Question Box -->
            <div style="background: var(--surface-dark); border: 1px solid var(--glass-border-strong); border-radius: 16px; padding: 20px; margin-bottom: 18px;">
                <h3 style="font-size: 18px; color: var(--text-light); margin-bottom: 16px; line-height: 1.5;">
                    <i class="fa-solid fa-circle-question text-gold"></i> ${escapeHtml(localizedQuestion.prompt)}
                </h3>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${localizedQuestion.displayOptions.map((opt, idx) => `
                        <button class="btn btn-outline" style="justify-content: flex-start; text-align: left; padding: 12px 16px; font-size: 15px;" onclick="answerLessonQuestion(${idx}, ${q.answer}, '${localizedQuestion.displayExplanation.replace(/'/g, "\\'")}')">
                            <span style="font-weight: bold; color: var(--warm-sand); margin-right: 8px;">${String.fromCharCode(65 + idx)}.</span> ${escapeHtml(opt)}
                        </button>
                    `).join('')}
                </div>

                <div id="quiz-question-feedback" style="margin-top: 14px;"></div>
            </div>
        `;
    }

    window.answerLessonQuestion = function(chosenIdx, correctIdx, explanation) {
        const feedbackEl = document.getElementById('quiz-question-feedback');
        if (!feedbackEl) return;

        if (chosenIdx === correctIdx) {
            activeLessonState.score++;
            feedbackEl.innerHTML = `
                <div style="padding: 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid var(--emerald); border-radius: 12px; color: var(--emerald);">
                    <strong>${getMultilingualLessonText('correct_ans')}</strong>
                    <p style="font-size: 13px; margin: 4px 0 10px 0;">${explanation}</p>
                    <button class="btn btn-primary" style="padding: 6px 16px; font-size: 12px;" onclick="advanceQuizQuestion()">
                        ${getMultilingualLessonText('next_q')}
                    </button>
                </div>
            `;
        } else {
            feedbackEl.innerHTML = `
                <div style="padding: 12px; background: rgba(244, 63, 94, 0.2); border: 1px solid var(--coral); border-radius: 12px; color: var(--coral);">
                    <strong>${getMultilingualLessonText('incorrect_ans')}</strong>
                    <p style="font-size: 13px; margin: 4px 0 10px 0;">${explanation}</p>
                    <button class="btn btn-primary" style="padding: 6px 16px; font-size: 12px;" onclick="advanceQuizQuestion()">
                        ${getMultilingualLessonText('next_q')}
                    </button>
                </div>
            `;
        }
    };

    window.advanceQuizQuestion = function() {
        activeLessonState.quizIdx++;
        renderLessonQuizStep();
    };

    // Final Lesson Completion & Score Summary
    function renderLessonCompleteSummary() {
        const content = document.getElementById('dialect-modal-content');
        if (!content) return;

        const { lessonId, score } = activeLessonState;
        const completedLessons = getCompletedDialectLessons();
        const alreadyCompleted = completedLessons.includes(Number(lessonId));
        const totalXP = alreadyCompleted ? 0 : 200 + (score * 10);

        if (!alreadyCompleted) {
            completedLessons.push(Number(lessonId));
            completedLessons.sort((a, b) => a - b);
            localStorage.setItem('saleem_completed_dialect_lessons', JSON.stringify(completedLessons));
            localStorage.setItem('saleem_learning_last_lesson', `dialect:${lessonId}`);
        }

        // Update XP & Streak in localStorage
        let userXP = parseInt(localStorage.getItem('saleem_user_xp') || '0');
        userXP += totalXP;
        localStorage.setItem('saleem_user_xp', userXP);
        updateLocalLearningStats();

        content.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 60px; margin-bottom: 10px;">🏆</div>
                <h2 style="font-size: 24px; color: var(--warm-sand); margin-bottom: 8px;">${getMultilingualLessonText('congrats', { lessonId })}</h2>
                <p style="font-size: 15px; color: var(--text-muted); margin-bottom: 20px;">${getMultilingualLessonText('summary_sub')}</p>

                <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 24px;">
                    <div style="background: rgba(16, 185, 129, 0.2); border: 1px solid var(--emerald); padding: 14px 20px; border-radius: 14px; text-align: center;">
                        <span style="font-size: 12px; color: var(--text-muted); display: block;">${getMultilingualLessonText('score_label')}</span>
                        <strong style="font-size: 22px; color: var(--emerald);">${score} / 20 Correct</strong>
                    </div>

                    <div style="background: rgba(232, 171, 99, 0.2); border: 1px solid var(--warm-sand); padding: 14px 20px; border-radius: 14px; text-align: center;">
                        <span style="font-size: 12px; color: var(--text-muted); display: block;">${getMultilingualLessonText('xp_label')}</span>
                        <strong style="font-size: 22px; color: var(--warm-sand);">+${totalXP} XP</strong>
                    </div>
                </div>

                <button class="btn btn-primary" style="width: 100%; justify-content: center; padding: 14px; font-size: 16px;" onclick="finishLessonModal()">
                    ${getMultilingualLessonText('continue_btn')}
                </button>
            </div>
        `;
    }

    window.finishLessonModal = function() {
        document.getElementById('dialect-modal').style.display = 'none';
        renderDuolingoSnakePath();
    };

    // Culture Lesson Modal (Locked for 72 Days)
    window.openCultureLessonModal = function(lessonId) {
        const modal = document.getElementById('culture-modal');
        const content = document.getElementById('culture-modal-content');
        const lesson = cultureLessonsData.find(item => Number(item.id) === Number(lessonId));
        if (!modal || !content) return;
        if (!lesson) {
            content.innerHTML = '<div style="text-align:center; padding:32px; color:var(--text-muted);">This culture lesson has no dataset record yet. No replacement content was generated.</div>';
            modal.style.display = 'flex';
            return;
        }
        const selectedLanguage = getSelectedLanguage();
        const cultureTitle = selectedLanguage === 'en'
            ? lesson.title_en
            : selectedLanguage === 'ar'
                ? lesson.title_ar
                : lesson[`title_${selectedLanguage}`];
        const cultureStory = selectedLanguage === 'en'
            ? lesson.story_en
            : selectedLanguage === 'ar'
                ? lesson.story_ar
                : lesson[`story_${selectedLanguage}`];
        const cultureCategory = selectedLanguage === 'en'
            ? lesson.category_en
            : selectedLanguage === 'ar'
                ? lesson.category_ar
                : lesson[`category_${selectedLanguage}`];
        if (!cultureTitle || !cultureStory) {
            renderTranslationUnavailable(content, getLanguageRuntimeText('coverageNotice', selectedLanguage));
            modal.style.display = 'flex';
            return;
        }
        activeCultureLessonId = Number(lessonId);

        content.innerHTML = `
            <div style="margin-bottom:18px;">
                <span class="tag" style="border-color:var(--emerald); color:var(--emerald);">${escapeHtml(cultureCategory)}</span>
                <h2 style="font-size:22px; color:var(--warm-sand); margin:10px 0 8px;">${escapeHtml(cultureTitle)}</h2>
                <p style="font-size:14px; line-height:1.7; color:var(--text-light);">${formatTrustedText(cultureStory)}</p>
            </div>
            <div id="practice-test-container">
                <button class="btn btn-primary" style="width:100%; justify-content:center;" onclick="startSituationalTest(${Number(lessonId)})">${escapeHtml(getLanguageRuntimeText('startPractice', selectedLanguage))}</button>
            </div>
        `;
        modal.style.display = 'flex';
        return;
        alert("🔒 Track 2: Egyptian Culture Track is currently locked. It will unlock in 72 days!\n🔒 مسار الثقافة المصرية مغلق حالياً وسيطرح بعد 72 يوماً.");
        return;
    };

    window.startSituationalTest = function(lessonId) {
        const testContainer = document.getElementById('practice-test-container');
        if (!testContainer) return;

        const lesson = cultureLessonsData.find(l => Number(l.id) === Number(lessonId));
        if (!lesson || !Array.isArray(lesson.practice_test) || lesson.practice_test.length === 0) {
            testContainer.innerHTML = '<p style="color:var(--text-muted);">This lesson has no practice test in the existing dataset.</p>';
            return;
        }
        const selectedLanguage = getSelectedLanguage();
        const q = lesson.practice_test[0];
        const localizedQuestion = selectedLanguage === 'en'
            ? { prompt: q.question_en || q.question, options: q.options, explanation: q.explanation }
            : selectedLanguage === 'ar'
                ? { prompt: q.question, options: q.options, explanation: q.explanation }
                : {
                    prompt: q[`question_${selectedLanguage}`],
                    options: q[`options_${selectedLanguage}`],
                    explanation: q[`explanation_${selectedLanguage}`]
                };
        if (!localizedQuestion.prompt || !Array.isArray(localizedQuestion.options) || !localizedQuestion.explanation) {
            renderTranslationUnavailable(testContainer);
            return;
        }
        const quizHeading = selectedLanguage === 'en' ? 'Real-Life Situation Quiz:' : 'اختبار موقف واقعي:';

        testContainer.innerHTML = `
            <div style="background: var(--surface-dark); padding: 16px; border-radius: 14px; border: 1px solid var(--glass-border-strong); margin-top: 10px;">
                <h4 style="font-size: 16px; color: var(--warm-sand); margin-bottom: 12px;"><i class="fa-solid fa-circle-question"></i> ${quizHeading}</h4>
                <p style="font-size: 15px; color: var(--text-light); margin-bottom: 16px;">${escapeHtml(localizedQuestion.prompt)}</p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${localizedQuestion.options.map((opt, idx) => `
                        <button class="btn btn-outline" style="justify-content: flex-start; text-align: left;" onclick="checkAnswer(${idx}, ${q.answer}, '${localizedQuestion.explanation.replace(/'/g, "\\'")}')">
                            ${idx + 1}. ${escapeHtml(opt)}
                        </button>
                    `).join('')}
                </div>
                <div id="quiz-feedback" style="margin-top: 14px;"></div>
            </div>
        `;
    };

    window.checkAnswer = function(chosen, correct, exp) {
        const fb = document.getElementById('quiz-feedback');
        if (!fb) return;

        if (chosen === correct) {
            fb.innerHTML = `
                <div style="padding: 12px; background: rgba(16, 185, 129, 0.2); border: 1px solid var(--emerald); border-radius: 10px; color: var(--emerald);">
                    <strong>🎉 إجابة ممتازة وسليمة! (+50 XP)</strong>
                    <p style="font-size: 12px; margin-top: 4px;">${exp}</p>
                    <button class="btn btn-primary" style="margin-top: 10px; padding: 6px 14px; font-size: 12px;" onclick="claimCultureXP(50)">Claim XP & Complete Lesson</button>
                </div>
            `;
        } else {
            fb.innerHTML = `
                <div style="padding: 12px; background: rgba(244, 63, 94, 0.2); border: 1px solid var(--coral); border-radius: 10px; color: var(--coral);">
                    <strong>❌ حاول مرة أخرى!</strong>
                    <p style="font-size: 12px; margin-top: 4px;">اختر الخيار الأفضل الثقافياً ومحترماً في التعامل.</p>
                </div>
            `;
        }
    };

    window.claimCultureXP = function(xp) {
        const completedLessons = getCompletedCultureLessons();
        const alreadyCompleted = activeCultureLessonId !== null && completedLessons.includes(activeCultureLessonId);
        if (!alreadyCompleted && activeCultureLessonId !== null) {
            completedLessons.push(activeCultureLessonId);
            completedLessons.sort((a, b) => a - b);
            localStorage.setItem('saleem_completed_culture_lessons', JSON.stringify(completedLessons));
            localStorage.setItem('saleem_learning_last_lesson', `culture:${activeCultureLessonId}`);
        }
        let currentXP = parseInt(localStorage.getItem('saleem_user_xp') || '0');
        if (!alreadyCompleted) currentXP += xp;
        localStorage.setItem('saleem_user_xp', currentXP);
        updateLocalLearningStats();

        document.getElementById('culture-modal').style.display = 'none';
        renderDuolingoSnakePath();
    };

    // Close Modal Listeners
    const closeCultModal = document.getElementById('close-culture-modal');
    if (closeCultModal) {
        closeCultModal.addEventListener('click', () => {
            document.getElementById('culture-modal').style.display = 'none';
        });
    }

    const closeDialModal = document.getElementById('close-dialect-modal');
    if (closeDialModal) {
        closeDialModal.addEventListener('click', () => {
            document.getElementById('dialect-modal').style.display = 'none';
        });
    }

    // Dialect 10 Phrases Daily Quest Modal
    window.openDialectQuestModal = function(levelId, levelName) {
        const modal = document.getElementById('dialect-modal');
        const content = document.getElementById('dialect-modal-content');
        if (!modal || !content) return;

        const samplePhrases = [
            { word: "إزيك يا باشا", pron: "Izayyak ya basha", eng: "How are you sir?", exp: "Standard polite Egyptian greeting." },
            { word: "على جنب يا اسطى", pron: "Ala gamb ya osta", eng: "Pull over driver please", exp: "Essential microbus/taxi phrase." },
            { word: "قشطة وزي الفل", pron: "Ashta w zai el-fol", eng: "Awesome and super fine", exp: "Popular positive expression." },
            { word: "خلصانة بشياكة", pron: "Khalsana b sheyaka", eng: "It's a deal in style!", exp: "Slang for deal agreed gracefully." },
            { word: "ربنا يخليك ويحفظك", pron: "Rabbena yekhalik", eng: "May God preserve you", exp: "Traditional Egyptian blessing." },
            { word: "بكام ده يا معلم", pron: "Bikam dah ya ma'allem", eng: "How much is this?", exp: "Market bargaining phrase." },
            { word: "تسلم إيدك", pron: "Teslam idak", eng: "Well done / Great job", exp: "Praise for good work or meal." },
            { word: "ألف سلامة عليك", pron: "Alf salama 'aleik", eng: "Get well soon", exp: "Compassionate illness greeting." },
            { word: "منور يا كبير", pron: "Menawwar ya kabeer", eng: "You brighten the place boss", exp: "Warm welcome." },
            { word: "على راسي من فوق", pron: "Ala rasi men foq", eng: "With my pleasure / My honor", exp: "Expression of deep respect." }
        ];

        content.innerHTML = `
            <div style="text-align: center; margin-bottom: 16px;">
                <span class="tag" style="border-color: var(--emerald); color: var(--emerald);"><i class="fa-solid fa-fire text-gold"></i> Daily 10 Egyptian Phrases Quest</span>
                <h2 style="font-size: 20px; color: var(--text-light); margin-top: 6px;">${levelName}</h2>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; padding-right: 6px;">
                ${samplePhrases.map((p, idx) => `
                    <div style="padding: 10px 14px; background: var(--surface-dark); border-radius: 12px; border-left: 4px solid var(--emerald); display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <strong style="font-size: 16px; color: var(--warm-sand);">${idx + 1}. ${p.word}</strong>
                            <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;">🗣️ <em>${p.pron}</em> — ${p.eng}</p>
                        </div>
                        <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px;" onclick="speakText('${p.word}', 'ar-EG')">
                            <i class="fa-solid fa-volume-high"></i>
                        </button>
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 18px; padding: 14px;" onclick="claimDialectXP(100)">
                <i class="fa-solid fa-circle-check"></i> Complete Quest & Claim 100 XP
            </button>
        `;

        modal.style.display = 'flex';
    };

    window.claimDialectXP = function(xp) {
        let currentXP = parseInt(localStorage.getItem('saleem_user_xp') || '1250');
        currentXP += xp;
        localStorage.setItem('saleem_user_xp', currentXP);

        document.getElementById('dialect-modal').style.display = 'none';
        renderDuolingoSnakePath();
    };

    // Initial render call
    renderDuolingoSnakePath();

    // -------------------------------------------------------------
    // 7. GOOGLE MAPS API LEGAL INSTITUTIONS ACCESS SYSTEM
    // -------------------------------------------------------------
    const legalInstitutionsData = [
        {
            id: "inst-1",
            name: "UNHCR Main Refugee Registration Center",
            cat: "unhcr",
            type: "UN Agency",
            address: "17 Mecca El-Mokarrama Street, 7th District, 6th of October City",
            phone: "+20 2 2728 4300",
            hours: "Sun-Thu: 8:00 AM - 3:00 PM",
            wait: "45-90 mins",
            services: "Yellow Card Registration, Protection, Asylum Processing",
            languages: "Arabic, English, Oromo, Somali, Tigrinya, French",
            docs: ["Valid Passport/Travel ID", "4 Passport Photos", "Egyptian Phone Number", "Original Lease Agreement"],
            beforeGuide: "Verify appointment rules through UNHCR Egypt before travelling. Keep original documents in a safe waterproof folder.",
            phrase: "عندي معاد في المفوضية تجديد كارت أصفر (Aandi ma'ad fe el-mofawadiya)",
            lat: 29.9744,
            lng: 30.9575
        },
        {
            id: "inst-2",
            name: "Passports & Immigration Authority (Abbasiya)",
            cat: "immigration",
            type: "Government Ministry",
            address: "El-Abbasiya Square, Cairo Governorate",
            phone: "+20 2 2684 0404",
            hours: "Sun-Thu: 8:30 AM - 2:00 PM",
            wait: "60-120 mins",
            services: "Residency Permits, Visa Extensions, Stamped Passports",
            languages: "Arabic, English",
            docs: ["UNHCR Yellow Card", "Passport Copy", "4 Photos", "Stamped Rental Lease"],
            beforeGuide: "Buy official residency application forms from the window inside building.",
            phrase: "عايز أجدد الإقامة كارت أصفر (Ayiz agadded el-eqama kart asfar)",
            lat: 30.0715,
            lng: 31.2825
        },
        {
            id: "inst-3",
            name: "Egyptian Red Crescent Health Center",
            cat: "health",
            type: "Medical NGO",
            address: "Zahraa El Maadi, Cairo Governorate",
            phone: "19963 / +20 2 2519 2831",
            hours: "Daily 24/7 Emergency Clinic",
            wait: "15-30 mins",
            services: "Free Primary Care, Maternal Health, Pediatrics, Emergency Triage",
            languages: "Arabic, English, French",
            docs: ["UNHCR Yellow Card or Passport ID"],
            beforeGuide: "Emergency triage is available 24/7 for acute illness or injury.",
            phrase: "محتاج تكشف على طفلي طوارئ (Mehtaaj tikshef ala tefly taware'a)",
            lat: 29.9792,
            lng: 31.2875
        },
        {
            id: "inst-4",
            name: "St. Andrew's Refugee Services (StARS) Legal Aid",
            cat: "legal",
            type: "Legal Aid NGO",
            address: "38 26th of July Street, Downtown Cairo",
            phone: "+20 2 2575 9451",
            hours: "Sun-Thu: 9:00 AM - 4:00 PM",
            wait: "30-60 mins",
            services: "Free Legal Aid, Refugee Status Appeal, Unaccompanied Minors",
            languages: "Arabic, English, Amharic, Oromo, Somali, Tigrinya",
            docs: ["UNHCR File Number", "Identity Card"],
            beforeGuide: "Call helpline to schedule legal consultation slot.",
            phrase: "عايز استشارة قانونية من مجاني StARS (Ayiz istishara qanooneya StARS)",
            lat: 30.0535,
            lng: 31.2415
        },
        {
            id: "inst-5",
            name: "Egyptian Council for Refugee Rights (ECRR)",
            cat: "legal",
            type: "Human Rights NGO",
            address: "Dokki Street, Dokki, Giza",
            phone: "+20 2 3762 1980",
            hours: "Sun-Thu: 9:30 AM - 3:30 PM",
            wait: "30 mins",
            services: "Legal Defense, Detention Intervention, Labor Protection",
            languages: "Arabic, English",
            docs: ["Detention Case Number or UNHCR Card"],
            beforeGuide: "Free emergency legal representation for administrative detention.",
            phrase: "محتاج محامي محتجز (Mehtaaj mohamy mohtagas)",
            lat: 30.0385,
            lng: 31.2115
        },
        {
            id: "inst-6",
            name: "Ministry of Health Refugee Primary Health Clinic",
            cat: "health",
            type: "Public Health Clinic",
            address: "Faisal Main Street, Giza Governorate",
            phone: "+20 2 3584 1012",
            hours: "Sun-Thu: 8:00 AM - 2:00 PM",
            wait: "20-45 mins",
            services: "Vaccinations, Essential Medicine, General Medicine",
            languages: "Arabic, English",
            docs: ["UNHCR Yellow Card"],
            beforeGuide: "Vaccinations for refugee infants are provided completely free.",
            phrase: "عايز تطعيمات الأطفال المجانية (Ayiz tat'eemat el-atfal el-magganeya)",
            lat: 29.9985,
            lng: 31.1715
        },
        {
            id: "inst-7",
            name: "Cairo Central Police Refugee Affairs Unit",
            cat: "police",
            type: "Public Security",
            address: "Bab El-Khalq Square, Central Cairo",
            phone: "122 / +20 2 2391 0000",
            hours: "24/7 Operations",
            wait: "Variable",
            services: "Incident Reports, Lost Document Filing, Emergency Protection",
            languages: "Arabic, English",
            docs: ["Valid ID or Copy of Yellow Card"],
            beforeGuide: "File an official police report ('Mahdar') immediately if passport is lost.",
            phrase: "عايز أعمل محضر فقدان باسبور (Ayiz a'amel mahdar foqdan passport)",
            lat: 30.0444,
            lng: 31.2455
        },
        {
            id: "inst-8",
            name: "Caritas Egypt Medical & Social Center",
            cat: "health",
            type: "Refugee Support Center",
            address: "Road 9, Maadi, Cairo Governorate",
            phone: "+20 2 2358 2901",
            hours: "Sun-Thu: 8:30 AM - 3:00 PM",
            wait: "30 mins",
            services: "Medical Subsidies, Social Assistance, Vulnerability Grants",
            languages: "Arabic, English, French",
            docs: ["UNHCR Card & Doctor Referral"],
            beforeGuide: "Brings medical reports for health subsidy assistance approval.",
            phrase: "عندي تحويل طبي كاريتاس (Aandi tahweel tebby Caritas)",
            lat: 29.9615,
            lng: 31.2575
        }
    ];

    const instGrid = document.getElementById('institutions-directory-grid');
    const instCatChips = document.getElementById('institution-category-chips');
    const instSearchInput = document.getElementById('institution-search-input');
    const findHelpButton = document.getElementById('find-help-btn');
    const chooseAreaButton = document.getElementById('choose-area-btn');
    const searchAreaButton = document.getElementById('search-area-btn');
    const manualAreaPanel = document.getElementById('manual-area-panel');
    const serviceStatus = document.getElementById('service-location-status');
    const governorateSelect = document.getElementById('service-governorate');
    const citySelect = document.getElementById('service-city');
    const serviceSort = document.getElementById('service-sort');
    let serviceLocationMode = 'all';
    legalInstitutionsData.length = 0;
    let googleMapInstance = null;
    let mapMarkers = [];

    function normalizeInstitutionCategory(category) {
        const key = String(category || '').toLowerCase();
        if (key === 'healthcare') return 'health';
        if (key === 'education' || key === 'employment' || key === 'refugee_support' || key === 'ngo' || key === 'government' || key === 'training' || key === 'programming' || key === 'pharmacy') return key;
        return key || 'legal';
    }

    function renderInstitutionsDirectoryUI(selectedCat = 'all', searchQuery = '') {
        if (!instGrid) return;
        instGrid.innerHTML = '';
        const selectedLanguage = getSelectedLanguage();
        const isArabic = selectedLanguage === 'ar';

        let filtered = legalInstitutionsData;
        if (selectedCat !== 'all') {
            filtered = filtered.filter(i => i.cat === selectedCat);
        }
        if (searchQuery.trim().length > 0) {
            const q = searchQuery.toLowerCase().trim();
            filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || i.address.toLowerCase().includes(q) || i.phrase.toLowerCase().includes(q) || (selectedLanguage === 'en' && i.services.toLowerCase().includes(q)));
        }

        if (filtered.length === 0) {
            instGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fa-solid fa-map-location-dot"></i>
                    <h4>${escapeHtml(getLanguageRuntimeText('serviceNoResults', selectedLanguage))}</h4>
                    <p>${escapeHtml(getLanguageRuntimeText('coverageNotice', selectedLanguage))}</p>
                </div>
            `;
            return;
        }

        filtered.forEach(inst => {
            const card = document.createElement('div');
            card.className = 'card action-card';
            card.style.padding = '16px';
            card.style.margin = '0';
            card.style.background = 'var(--bg-dark)';
            card.style.border = '1px solid var(--glass-border)';

            const docsListHTML = inst.docs.map(d => `<li style="font-size: 11px; color: var(--text-light); margin-bottom: 2px;">- ${escapeHtml(d)}</li>`).join('');
            const showSourceLanguageDetails = selectedLanguage === 'en' || isArabic;
            const sourceHTML = inst.sourceUrl ? `
                <div style="padding: 8px 10px; background: rgba(232, 171, 99, 0.1); border-left: 3px solid var(--warm-sand); border-radius: 6px; margin-bottom: 12px;">
                    <strong style="font-size: 10px; color: var(--warm-sand); display: block;">${escapeHtml(getAppActionText('sourceChecked'))}${inst.sourceCheckedAt ? ` ${escapeHtml(inst.sourceCheckedAt)}` : ''}</strong>
                    <a href="${escapeHtml(inst.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: var(--text-light);">${escapeHtml(inst.sourceName || getAppActionText('officialSource'))}</a>
                    ${showSourceLanguageDetails && inst.trustNote ? `<p style="font-size: 11px; color: var(--text-muted); margin: 4px 0 0 0;">${escapeHtml(inst.trustNote)}</p>` : ''}
                </div>
            ` : '';

            card.innerHTML = `
                <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px;">
                    <span class="tag tag-ngo" style="font-size: 10px;">${escapeHtml(getUiTranslation(({ unhcr: 'catUnhcr', immigration: 'catImmigration', health: 'catHealth', legal: 'catLegal', police: 'catPolice' }[inst.cat] || 'verifiedServices'), selectedLanguage))}</span>
                    ${showSourceLanguageDetails && inst.wait ? `<span style="font-size: 10px; color: var(--emerald); font-weight: 600;"><i class="fa-solid fa-clock"></i> ${escapeHtml(inst.wait)}</span>` : ''}
                </div>
                <h3 style="font-size: 16px; color: #fff; margin-bottom: 6px;">${escapeHtml(inst.name)}</h3>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;"><i class="fa-solid fa-location-dot text-gold"></i> ${escapeHtml(inst.address || '')}${inst.distanceKm !== null && inst.distanceKm !== undefined ? ` · ${escapeHtml(String(inst.distanceKm))} km` : ''}</p>
                ${showSourceLanguageDetails && inst.hours ? `<p style="font-size: 11px; color: var(--warm-sand); margin-bottom: 10px;">${escapeHtml(inst.hours)}</p>` : ''}

                ${showSourceLanguageDetails && inst.docs.length ? `<div style="padding: 8px 10px; background: var(--surface-dark); border-radius: 8px; margin-bottom: 10px;">
                    <strong style="font-size: 11px; color: var(--warm-sand); display: block; margin-bottom: 4px;"><i class="fa-solid fa-clipboard-check"></i> ${escapeHtml(getAppActionText('requiredDocs'))}:</strong>
                    <ul style="list-style: none; padding: 0; margin: 0;">${docsListHTML}</ul>
                </div>` : ''}

                ${showSourceLanguageDetails && inst.phrase ? `<div style="padding: 8px 10px; background: rgba(16, 185, 129, 0.1); border-left: 3px solid var(--emerald); border-radius: 6px; margin-bottom: 12px;"><strong style="font-size: 10px; color: var(--emerald); display: block;">💡 ${isArabic ? 'عبارة مصرية مفيدة' : 'Useful Phrase to Say:'}</strong><span style="font-size: 12px; color: #fff;">"${escapeHtml(inst.phrase)}"</span></div>` : ''}
                ${sourceHTML}

                <div style="display: flex; gap: 8px; align-items: center; margin-top: auto;">
                    ${inst.phone ? `<a href="tel:${escapeHtml(inst.phone)}" class="btn btn-primary" style="padding: 6px 12px; font-size: 11px; text-decoration: none; flex: 1; justify-content: center;"><i class="fa-solid fa-phone"></i> ${escapeHtml(getAppActionText('call'))}</a>` : ''}
                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inst.name + ' ' + (inst.address || ''))}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="padding: 6px 12px; font-size: 11px; text-decoration: none; flex: 1; justify-content: center;">
                        <i class="fa-solid fa-diamond-turn-right"></i> ${escapeHtml(getAppActionText('directions'))}
                    </a>
                </div>
            `;
            instGrid.appendChild(card);
        });
    }

    async function loadServerResources() {
        try {
            const data = await API.fetch('/resources');
            if (data && Array.isArray(data.resources) && data.resources.length > 0) {
                const mapped = data.resources.map(r => ({
                    id: r.id,
                    name: r.name,
                    cat: normalizeInstitutionCategory(r.category),
                    type: r.category.toUpperCase(),
                    address: r.address || r.location,
                    phone: r.phone || '',
                    hours: r.hours || '',
                    wait: r.wait_time || '',
                    services: r.services || r.description || '',
                    languages: r.languages || '',
                    docs: Array.isArray(r.required_documents) ? r.required_documents : [],
                    phrase: r.useful_phrase || 'محتاج مساعدة من فضلكم',
                    lat: Number.isFinite(Number(r.latitude)) ? Number(r.latitude) : null,
                    lng: Number.isFinite(Number(r.longitude)) ? Number(r.longitude) : null,
                    distanceKm: r.distance_km,
                    governorate: r.governorate || '',
                    city: r.city || '',
                    sourceName: r.source_name,
                    sourceUrl: r.source_url,
                    sourceCheckedAt: r.source_checked_at,
                    trustNote: r.trust_note
                }));

                const existingIds = new Set(legalInstitutionsData.map(i => i.id));
                mapped.forEach(m => {
                    if (!existingIds.has(m.id)) legalInstitutionsData.push(m);
                });
                populateAreaSelectors();
                updateServiceLocationCopy();
                renderInstitutionsDirectoryUI('all', '');
            }
        } catch (e) {
            console.warn('Resources server sync offline fallback:', e);
        }
    }

    function updateServiceLocationCopy() {
        const text = key => getLanguageRuntimeText(key, getSelectedLanguage());
        const labels = {
            'find-help-label': text('serviceFindHelp'),
            'choose-area-label': text('serviceChooseArea'),
            'search-area-label': text('serviceSearchArea'),
            'service-governorate-label': text('serviceGovernorate'),
            'service-city-label': text('serviceCity'),
            'service-sort-label': text('serviceSort')
        };
        Object.entries(labels).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
        if (serviceStatus && serviceLocationMode === 'all') serviceStatus.textContent = text('servicePermission');
        if (serviceSort) {
            const selected = serviceSort.value || 'best-match';
            serviceSort.innerHTML = `<option value="nearest">${escapeHtml(text('serviceNearest'))}</option><option value="best-match">${escapeHtml(text('serviceBestMatch'))}</option><option value="recently-verified">${escapeHtml(text('serviceRecentlyVerified'))}</option>`;
            serviceSort.value = selected;
        }
    }

    function populateAreaSelectors() {
        if (!governorateSelect || !citySelect) return;
        const governorates = [...new Set(legalInstitutionsData.map(item => item.governorate).filter(Boolean))].sort();
        const cities = [...new Set(legalInstitutionsData.map(item => item.city).filter(Boolean))].sort();
        governorateSelect.innerHTML = governorates.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
        citySelect.innerHTML = cities.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    }

    async function loadNearbyResources(query) {
        try {
            const params = new URLSearchParams({ ...query, category: document.querySelector('.chip-btn.active')?.getAttribute('data-inst-cat') || '', sort: serviceSort?.value || 'best-match' });
            if (!params.get('category') || params.get('category') === 'all') params.delete('category');
            const data = await API.fetch(`/resources/nearby?${params.toString()}`);
            const mapped = (data.resources || []).map(r => ({ id: r.id, name: r.name, cat: normalizeInstitutionCategory(r.category), type: String(r.category || '').toUpperCase(), address: r.address || r.location || '', phone: r.phone || '', hours: r.hours || '', wait: r.wait_time || '', services: r.services || r.description || '', languages: r.languages || '', docs: Array.isArray(r.required_documents) ? r.required_documents : [], phrase: r.useful_phrase || '', lat: Number.isFinite(Number(r.latitude)) ? Number(r.latitude) : null, lng: Number.isFinite(Number(r.longitude)) ? Number(r.longitude) : null, distanceKm: r.distance_km, governorate: r.governorate || '', city: r.city || '', sourceName: r.source_name, sourceUrl: r.source_url, sourceCheckedAt: r.source_checked_at, trustNote: r.trust_note }));
            legalInstitutionsData.splice(0, legalInstitutionsData.length, ...mapped);
            serviceLocationMode = data.location_mode || 'manual';
            if (serviceStatus) serviceStatus.textContent = mapped.length ? `${mapped.length} · ${getLanguageRuntimeText('serviceBestMatch')}` : getLanguageRuntimeText('serviceNoResults');
            renderInstitutionsDirectoryUI('all', instSearchInput?.value || '');
        } catch (error) {
            if (serviceStatus) serviceStatus.textContent = getLanguageRuntimeText('serviceNoResults');
            console.warn('Nearby resources unavailable:', error);
        }
    }

    function requestOneShotLocation() {
        if (!navigator.geolocation) {
            serviceLocationMode = 'manual';
            if (serviceStatus) serviceStatus.textContent = getLanguageRuntimeText('serviceGpsUnavailable');
            if (manualAreaPanel) manualAreaPanel.hidden = false;
            return;
        }
        if (serviceStatus) serviceStatus.textContent = getLanguageRuntimeText('servicePermission');
        navigator.geolocation.getCurrentPosition(
            position => loadNearbyResources({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
            () => { serviceLocationMode = 'manual'; if (serviceStatus) serviceStatus.textContent = getLanguageRuntimeText('serviceLocationDenied'); if (manualAreaPanel) manualAreaPanel.hidden = false; },
            { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 }
        );
    }

    async function loadUserStats() {
        if (!API.getToken()) return;
        try {
            const data = await API.fetch('/user/stats');
            if (data && data.streak) {
                const streakEl = document.getElementById('stat-streak-days');
                const wordsEl = document.getElementById('stat-words-learned');
                const phrasesEl = document.getElementById('stat-phrases-mastered');
                const localCompleted = getCompletedDialectLessons();
                const localWords = localCompleted.reduce((total, id) => {
                    const lesson = dialectLessons600.find(item => Number(item.id) === Number(id));
                    return total + (lesson && Array.isArray(lesson.words) ? lesson.words.length : 0);
                }, 0);
                const localStreak = parseInt(localStorage.getItem('saleem_user_streak') || '0');

                if (streakEl) streakEl.textContent = `🔥 ${data.streak.current_streak || 0}`;
                if (wordsEl) wordsEl.textContent = `${data.streak.total_words_learned || 0}+`;
                if (phrasesEl) phrasesEl.textContent = `${data.streak.total_phrases_mastered || 0}`;
                if (streakEl) streakEl.textContent = `Streak ${Math.max(data.streak.current_streak || 0, localStreak)}`;
                if (wordsEl) wordsEl.textContent = `${Math.max(data.streak.total_words_learned || 0, localWords)}`;
                if (phrasesEl) phrasesEl.textContent = `${Math.max(data.streak.total_phrases_mastered || 0, localWords)}`;
            }
        } catch (e) {
            console.warn('Stats sync offline:', e);
        }
    }

    function initGoogleMapsAndDirectory() {
        renderInstitutionsDirectoryUI('all', '');
        loadServerResources();
        loadUserStats();

        const mapElement = document.getElementById('institution-map');
        if (!mapElement) return;

        // Try initializing Google Map if API is loaded
        if (window.google && window.google.maps) {
            try {
                const cairoPos = { lat: 30.0444, lng: 31.2357 };
                googleMapInstance = new google.maps.Map(mapElement, {
                    center: cairoPos,
                    zoom: 11,
                    styles: [
                        { elementType: "geometry", stylers: [{ color: "#1f2937" }] },
                        { elementType: "labels.text.stroke", stylers: [{ color: "#1f2937" }] },
                        { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
                        { featureType: "road", elementType: "geometry", stylers: [{ color: "#374151" }] },
                        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f4c81" }] }
                    ]
                });

                legalInstitutionsData.filter(inst => Number.isFinite(inst.lat) && Number.isFinite(inst.lng)).forEach(inst => {
                    const marker = new google.maps.Marker({
                        position: { lat: inst.lat, lng: inst.lng },
                        map: googleMapInstance,
                        title: inst.name
                    });

                    const infoWindow = new google.maps.InfoWindow({
                        content: `<div style="color:#000; padding:4px;"><strong>${inst.name}</strong><br><small>${inst.address}</small><br><a href="tel:${inst.phone}">📞 Call ${inst.phone}</a></div>`
                    });

                    marker.addListener('click', () => {
                        infoWindow.open(googleMapInstance, marker);
                    });

                    mapMarkers.push(marker);
                });

                const fallbackNotice = document.getElementById('map-fallback-notice');
                if (fallbackNotice) fallbackNotice.style.display = 'none';
            } catch (e) {
                console.warn('Google Maps initialization fallback notice:', e);
            }
        }
    }

    if (instCatChips) {
        instCatChips.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                instCatChips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const cat = btn.getAttribute('data-inst-cat');
                const query = instSearchInput ? instSearchInput.value : '';
                renderInstitutionsDirectoryUI(cat, query);
            });
        });
    }

    if (instSearchInput) {
        instSearchInput.addEventListener('input', (e) => {
            const activeBtn = instCatChips ? instCatChips.querySelector('.chip-btn.active') : null;
            const cat = activeBtn ? activeBtn.getAttribute('data-inst-cat') : 'all';
            renderInstitutionsDirectoryUI(cat, e.target.value);
        });
    }

    if (findHelpButton) findHelpButton.addEventListener('click', requestOneShotLocation);
    if (chooseAreaButton) chooseAreaButton.addEventListener('click', () => {
        if (manualAreaPanel) manualAreaPanel.hidden = !manualAreaPanel.hidden;
        serviceLocationMode = 'manual';
        if (serviceStatus) serviceStatus.textContent = getLanguageRuntimeText('serviceChooseArea');
    });
    if (searchAreaButton) searchAreaButton.addEventListener('click', () => {
        const governorate = governorateSelect?.value || '';
        const city = citySelect?.value || '';
        localStorage.setItem('saleem_service_area', JSON.stringify({ governorate, city }));
        loadNearbyResources({ governorate, city });
    });
    if (serviceSort) serviceSort.addEventListener('change', () => {
        if (serviceLocationMode === 'all') return;
        const savedArea = JSON.parse(localStorage.getItem('saleem_service_area') || '{}');
        loadNearbyResources(savedArea);
    });

    updateServiceLocationCopy();
    if (uiLangSwitcher) uiLangSwitcher.addEventListener('change', () => updateServiceLocationCopy());

    initGoogleMapsAndDirectory();
});
