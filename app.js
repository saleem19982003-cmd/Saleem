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
            "hero-title": "Empowering Every Refugee to Build a Safe, Independent Life",
            "hero-sub": "Saleem bridges language barriers with real-time Egyptian colloquial translation, AI-driven legal & rights guidance, essential service directories, verified volunteers, and free programming education."
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
            assistantPair: 'Ask Saleem AI in English or Egyptian Arabic.'
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
            assistantPair: '\u0627\u0633\u0623\u0644 \u0645\u0633\u0627\u0639\u062f \u0633\u0644\u064a\u0645 \u0628\u0627\u0644\u0644\u0644\u0647\u062c\u0629 \u0627\u0644\u0645\u0635\u0631\u064a\u0629 \u0623\u0648 \u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.'
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

    let activeUiLanguage = 'en';

    function normalizeLanguage(lang) {
        return LANGUAGE_METADATA[lang] ? lang : 'en';
    }

    function getSelectedLanguage() {
        return normalizeLanguage(activeUiLanguage || localStorage.getItem('saleem_ui_lang') || localStorage.getItem('saleem_user_language') || 'en');
    }

    function getLanguageRuntimeText(key, lang = getSelectedLanguage()) {
        return LANGUAGE_RUNTIME_TEXT[lang]?.[key] || LANGUAGE_RUNTIME_TEXT.ar[key] || '';
    }

    function getUiTranslation(key, lang = getSelectedLanguage()) {
        if (key === 'hdr-translator-sub') {
            return LANGUAGE_RUNTIME_TEXT[lang]?.translatorPair || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en.translatorPair : getLanguageRuntimeText('egyptianArabicOnly', lang));
        }
        if (key === 'hdr-assistant-sub') {
            return LANGUAGE_RUNTIME_TEXT[lang]?.assistantPair || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en.assistantPair : getLanguageRuntimeText('egyptianArabicOnly', lang));
        }
        if (['brandSupport', 'localProfile', 'learningSnapshot'].includes(key)) {
            return LANGUAGE_RUNTIME_TEXT[lang]?.[key] || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en[key] : getLanguageRuntimeText('egyptianArabicOnly', lang));
        }
        const selectedDict = i18n[lang] || {};
        const alias = UI_I18N_ALIASES[key];
        return selectedDict[key]
            || (alias && selectedDict[alias])
            || LANGUAGE_RUNTIME_TEXT[lang]?.[key]
            || (lang === 'en' ? LANGUAGE_RUNTIME_TEXT.en[key] : LANGUAGE_RUNTIME_TEXT.ar[key])
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

    function applyUserData(userName, nationality, preferredLanguage) {
        const mapping = nationalityMap[nationality] || nationalityMap["Other"];
        const selectedLanguage = normalizeLanguage(preferredLanguage || mapping.lang);
        
        // Generate or retrieve unique Saleem Digital Pass User ID
        let userId = localStorage.getItem('saleem_user_id');
        if (!userId) {
            userId = 'SLM-' + Math.floor(100000 + Math.random() * 900000);
            localStorage.setItem('saleem_user_id', userId);
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
                // Auto register session with server
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

    checkFirstTimeOnboarding();

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
            timestamp: post.created_at ? new Date(post.created_at).toLocaleString() : 'Recently',
            replies: (post.replies || []).map(reply => ({
                id: reply.id,
                author: reply.author_name || 'Community member',
                nationality: reply.author_nationality || 'Community',
                text: reply.body,
                timestamp: reply.created_at ? new Date(reply.created_at).toLocaleString() : 'Recently'
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
                    <h4>No community posts yet</h4>
                    <p>Ask the first practical question or share a verified resource tip for others.</p>
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
                                <span class="tag" style="padding: 1px 6px; font-size: 9px; border-color: var(--emerald); color: var(--emerald);">${escapeHtml(r.nationality || 'Community')}</span>
                            </div>
                            <span style="font-size: 10px; color: var(--text-dim);">${escapeHtml(r.timestamp || 'Recently')}</span>
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
                            <span class="tag" style="padding: 1px 6px; font-size: 10px; border-color: var(--warm-sand); color: var(--warm-sand);">${escapeHtml(post.nationality || 'Community')}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button class="btn btn-outline" onclick="translatePost('${escapeHtml(post.id)}')" style="padding: 4px 8px; font-size: 11px;">
                            <i class="fa-solid fa-language"></i> Translate
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
                        <span><i class="fa-solid fa-comments"></i> ${replies.length} Answers / Replies</span>
                        <span style="font-size: 11px; color: var(--text-dim);"><i class="fa-solid fa-globe"></i> Visible to Everyone</span>
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

        targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--warm-sand);"><i class="fa-solid fa-spinner fa-spin"></i> Translating...</span>`;

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
                    <div style="font-size: 11px; color: var(--warm-sand); font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-language"></i> DeepSeek Translation:</div>
                    <p style="font-size: 13px; color: #fff; margin: 0; line-height: 1.4;">${formatTrustedText(translatedText)}</p>
                </div>
            `;
        } catch (e) {
            targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--coral);">Translation offline fallback.</span>`;
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
                    timestamp: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recently'
                }));
                reviewsToRender = mappedReviews;
                localStorage.setItem('saleem_user_reviews', JSON.stringify(reviewsToRender));
                if (avgRatingScore) avgRatingScore.textContent = data.average_rating || '0.0';
                if (totalReviewsCount) totalReviewsCount.textContent = data.total_count ? `Based on ${data.total_count} community reviews` : 'No public reviews yet';
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
            if (totalReviewsCount) totalReviewsCount.textContent = 'No public reviews yet';
            reviewsFeedContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-star"></i>
                    <h4>No community feedback yet</h4>
                    <p>Feedback appears here only after real users submit it.</p>
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
                            <span class="tag" style="padding: 1px 6px; font-size: 10px; border-color: var(--warm-sand); color: var(--warm-sand);">${escapeHtml(r.nationality || 'Community')}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <button class="btn btn-outline" onclick="translateReview('${r.id}')" style="padding: 4px 8px; font-size: 11px;">
                            <i class="fa-solid fa-language"></i> Translate
                        </button>
                        <div style="text-align: right;">
                            <div style="font-size: 13px; color: #FBBF24;">${starsString}</div>
                            <span style="font-size: 10px; color: var(--text-dim);">${escapeHtml(r.timestamp || 'Recently')}</span>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 8px;">
                    <strong style="font-size: 12px; color: var(--emerald); display: block; margin-bottom: 2px;"><i class="fa-solid fa-heart"></i> How Saleem Helped:</strong>
                    <p style="font-size: 13px; color: var(--text-light); line-height: 1.5; margin: 0;">${escapeHtml(r.helpText)}</p>
                </div>

                ${r.improvementText ? `
                    <div style="padding: 8px 12px; background: var(--surface-dark); border-radius: 8px; border-left: 3px solid var(--warm-sand); margin-top: 8px;">
                        <strong style="font-size: 11px; color: var(--warm-sand); display: block; margin-bottom: 2px;"><i class="fa-solid fa-lightbulb"></i> Recommended Improvement:</strong>
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
            if (totalReviewsCount) totalReviewsCount.textContent = `Based on ${reviews.length} community reviews`;
        }
    }

    window.translateReview = async function(reviewId) {
        const targetContainer = document.getElementById(`review-translation-${reviewId}`);
        if (!targetContainer) return;

        targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--warm-sand);"><i class="fa-solid fa-spinner fa-spin"></i> Translating review...</span>`;

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

            const translatedText = data && data.translation ? data.translation : 'Translation ready';

            targetContainer.innerHTML = `
                <div style="padding: 10px 12px; background: rgba(232, 171, 99, 0.15); border: 1px solid var(--warm-sand); border-radius: 10px; margin-top: 8px;">
                    <div style="font-size: 11px; color: var(--warm-sand); font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-language"></i> DeepSeek Translation:</div>
                    <p style="font-size: 13px; color: #fff; margin: 0; line-height: 1.4;">${translatedText}</p>
                </div>
            `;
        } catch (e) {
            targetContainer.innerHTML = `<span style="font-size: 12px; color: var(--coral);">Translation offline fallback.</span>`;
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

            translateOutput.innerHTML = `<p><i class="fa-solid fa-spinner fa-spin"></i> Processing Multilingual Translation...</p>`;

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
                            <span class="tag" style="border-color: var(--emerald); color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> Authentic Egyptian Dialect Translation</span>
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
                            <span class="tag" style="border-color: var(--emerald); color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> Saleem AI Multilingual Translation</span>
                            <button class="btn btn-primary" id="btn-speak-output" style="padding: 6px 14px; font-size: 12px;">
                                <i class="fa-solid fa-volume-high"></i> Listen Audio
                            </button>
                        </div>
                        <div style="font-size: 16px; color: var(--text-light); line-height: 1.6;">${translationText}</div>
                        <p style="margin-top: 14px; font-size: 12px; color: var(--emerald); display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-bolt text-gold"></i> Saleem AI Translation Engine
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
                <p style="margin-top: 10px; font-size: 13px; color: var(--coral);"><i class="fa-solid fa-triangle-exclamation"></i> Translation service is offline. Showing original text only.</p>
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
                                    <i class="fa-solid fa-volume-high"></i> Listen Audio
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
                <h3 style="color: var(--warm-sand); font-size: 20px;">[Translation] ${text}</h3>
                <p style="margin-top: 10px; font-size: 13px; color: var(--emerald);"><i class="fa-solid fa-circle-check"></i> Offline Translation Active</p>
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
        typingDiv.innerHTML = `<div class="msg-content" style="color: var(--warm-sand);"><i class="fa-solid fa-bolt fa-spin text-gold"></i> ${getSelectedLanguage() === 'en' ? 'Saleem AI...' : getLanguageRuntimeText('egyptianArabicOnly')}</div>`;
        chatHistory.appendChild(typingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        try {
            const data = await API.fetch('/ai/chat', {
                method: 'POST',
                body: JSON.stringify({ message: prompt, primary_language: getSelectedLanguage() })
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

        const savedName = localStorage.getItem('saleem_user_name') || 'Friend';

        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
        const fallbackMessage = getSelectedLanguage() === 'en'
            ? `Ahlan ${savedName}! Saleem AI is offline right now. I can still help with saved phrases and the verified services directory; please verify urgent legal, medical, or protection questions with the official provider.`
            : `أهلاً ${savedName}! خدمة المساعد غير متاحة الآن. يمكنني مساعدتك بالمحتوى المصري المحفوظ ودليل الخدمات الموثوق. يرجى التأكد من المعلومات القانونية أو الطبية العاجلة مع الجهة الرسمية.`;
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
            const response = await fetch(`/data/phrases_45.json?v=${LEARNING_DATA_VERSION}`, { cache: 'force-cache' });
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
            const res = await fetch(`${path}?v=${LEARNING_DATA_VERSION}`, { cache: 'force-cache' });
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
        if (lang === 'en') return track === 'dialect' ? `Egyptian Dialect Progression (${dialectLessons600.length || 'Unavailable'} Lessons)` : `Egyptian Culture Progression (${cultureLessonsData.length || 'Unavailable'} Lessons)`;
        if (lang === 'ar') return track === 'dialect' ? `مسار اللهجة المصرية (${dialectLessons600.length || 'غير متاح'} درس)` : `مسار الثقافة المصرية (${cultureLessonsData.length || 'غير متاح'} درس)`;
        return track === 'dialect' ? `مسار اللهجة المصرية (${dialectLessons600.length || 'غير متاح'} درس)` : `مسار الثقافة المصرية (${cultureLessonsData.length || 'غير متاح'} درس)`;
    }

    function getLocalizedLessonTitle(lesson, id, lang = getSelectedLanguage()) {
        if (lang === 'en') return lesson.title_en || '';
        if (lang === 'ar') return lesson.title_ar || '';
        return `\u0627\u0644\u062f\u0631\u0633 ${id}`;
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
            const label = currentTrack === 'dialect' ? 'Egyptian Dialect' : 'Egyptian Culture';
            trackTitle.innerHTML = `<i class="fa-solid fa-route text-gold"></i> <span>${label} Progression (${totalLessons} Lessons)</span>`;
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
    legalInstitutionsData.length = 0;
    let googleMapInstance = null;
    let mapMarkers = [];

    function normalizeInstitutionCategory(category) {
        const key = String(category || '').toLowerCase();
        if (key === 'healthcare') return 'health';
        if (key === 'education' || key === 'employment') return 'legal';
        return key || 'legal';
    }

    function renderInstitutionsDirectoryUI(selectedCat = 'all', searchQuery = '') {
        if (!instGrid) return;
        instGrid.innerHTML = '';
        const selectedLanguage = getSelectedLanguage();
        if (selectedLanguage !== 'en' && selectedLanguage !== 'ar') {
            renderTranslationUnavailable(instGrid, getLanguageRuntimeText('coverageNotice', selectedLanguage));
            return;
        }
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
                    <h4>${isArabic ? 'لا توجد خدمات موثقة متاحة' : 'No verified services loaded'}</h4>
                    <p>${isArabic ? 'تحقق من الاتصال أو جرّب تصنيفاً آخر. يعرض سليم السجلات العامة المدعومة بالمصادر فقط.' : 'Check your connection or try a different category. Saleem only shows source-backed public records by default.'}</p>
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

            const docsListHTML = isArabic ? '' : inst.docs.map(d => `<li style="font-size: 11px; color: var(--text-light); margin-bottom: 2px;">- ${escapeHtml(d)}</li>`).join('');
            const sourceHTML = inst.sourceUrl ? `
                <div style="padding: 8px 10px; background: rgba(232, 171, 99, 0.1); border-left: 3px solid var(--warm-sand); border-radius: 6px; margin-bottom: 12px;">
                    <strong style="font-size: 10px; color: var(--warm-sand); display: block;">${isArabic ? 'تم التحقق من المصدر' : 'Source checked'}${inst.sourceCheckedAt ? ` ${escapeHtml(inst.sourceCheckedAt)}` : ''}</strong>
                    <a href="${escapeHtml(inst.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; color: var(--text-light);">${escapeHtml(inst.sourceName || 'Official source')}</a>
                    ${inst.trustNote ? `<p style="font-size: 11px; color: var(--text-muted); margin: 4px 0 0 0;">${escapeHtml(inst.trustNote)}</p>` : ''}
                </div>
            ` : '';

            card.innerHTML = `
                <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px;">
                    <span class="tag tag-ngo" style="font-size: 10px;">${isArabic ? 'خدمة موثقة' : escapeHtml(inst.type)}</span>
                    ${isArabic ? '' : `<span style="font-size: 10px; color: var(--emerald); font-weight: 600;"><i class="fa-solid fa-clock"></i> Wait: ${escapeHtml(inst.wait)}</span>`}
                </div>
                <h3 style="font-size: 16px; color: #fff; margin-bottom: 6px;">${escapeHtml(inst.name)}</h3>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;"><i class="fa-solid fa-location-dot text-gold"></i> ${escapeHtml(inst.address)}</p>
                ${isArabic ? '' : `<p style="font-size: 11px; color: var(--warm-sand); margin-bottom: 10px;">⏰ ${escapeHtml(inst.hours)}</p>`}

                ${isArabic ? '' : `<div style="padding: 8px 10px; background: var(--surface-dark); border-radius: 8px; margin-bottom: 10px;">
                    <strong style="font-size: 11px; color: var(--warm-sand); display: block; margin-bottom: 4px;"><i class="fa-solid fa-clipboard-check"></i> Required Documents:</strong>
                    <ul style="list-style: none; padding: 0; margin: 0;">${docsListHTML}</ul>
                </div>`}

                <div style="padding: 8px 10px; background: rgba(16, 185, 129, 0.1); border-left: 3px solid var(--emerald); border-radius: 6px; margin-bottom: 12px;">
                    <strong style="font-size: 10px; color: var(--emerald); display: block;">💡 ${isArabic ? 'عبارة مصرية مفيدة' : 'Useful Phrase to Say:'}</strong>
                    <span style="font-size: 12px; color: #fff;">"${escapeHtml(inst.phrase)}"</span>
                </div>
                ${sourceHTML}

                <div style="display: flex; gap: 8px; align-items: center; margin-top: auto;">
                    <a href="tel:${inst.phone}" class="btn btn-primary" style="padding: 6px 12px; font-size: 11px; text-decoration: none; flex: 1; justify-content: center;">
                        <i class="fa-solid fa-phone"></i> ${isArabic ? 'اتصال مباشر' : 'Call Direct'}
                    </a>
                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inst.name + ' ' + inst.address)}" target="_blank" class="btn btn-outline" style="padding: 6px 12px; font-size: 11px; text-decoration: none; flex: 1; justify-content: center;">
                        <i class="fa-solid fa-diamond-turn-right"></i> ${isArabic ? 'الاتجاهات' : 'Directions'}
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
                    phone: r.phone || '+20 2 2728 4300',
                    hours: r.hours || 'Sun-Thu 8:00 AM - 3:00 PM',
                    wait: r.wait_time || '30 mins',
                    services: r.services || r.description,
                    languages: r.languages || 'Arabic, English',
                    docs: Array.isArray(r.required_documents) ? r.required_documents : ['ID / Passport'],
                    phrase: r.useful_phrase || 'محتاج مساعدة من فضلكم',
                    lat: r.latitude || 30.0444,
                    lng: r.longitude || 31.2357,
                    sourceName: r.source_name,
                    sourceUrl: r.source_url,
                    sourceCheckedAt: r.source_checked_at,
                    trustNote: r.trust_note
                }));

                const existingIds = new Set(legalInstitutionsData.map(i => i.id));
                mapped.forEach(m => {
                    if (!existingIds.has(m.id)) legalInstitutionsData.push(m);
                });
                renderInstitutionsDirectoryUI('all', '');
            }
        } catch (e) {
            console.warn('Resources server sync offline fallback:', e);
        }
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

                legalInstitutionsData.forEach(inst => {
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

    initGoogleMapsAndDirectory();
});
