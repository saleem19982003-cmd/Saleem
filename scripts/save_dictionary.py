import json
import os

data_dir = r"d:\Saleem\data"
os.makedirs(data_dir, exist_ok=True)

egyptian_expressions = [
    {
        "word": "قشطا / قشطة",
        "pronunciation": "Asha'ta / Qishta",
        "meaning": "تمام، ممتاز، وزي الفل",
        "english": "Awesome, great, perfectly fine",
        "example": "اللي بتقوله دا قشطة وزي الفل",
        "example_english": "What you're saying is awesome and totally clear",
        "category": "slang",
        "level": "intermediate"
    },
    {
        "word": "خلصانه",
        "pronunciation": "Khalsana",
        "meaning": "انتهت، موافق، تم الاتفاق",
        "english": "It's a deal, agreed, finished, settled",
        "example": "خلصانة بشياكة يا باشا",
        "example_english": "It's a deal gracefully my friend",
        "category": "slang",
        "level": "beginner"
    },
    {
        "word": "ملخبط",
        "pronunciation": "Malkhabat",
        "meaning": "مشوش، مخلوط، غير منظم",
        "english": "Mixed up, confused, disorganized",
        "example": "الأوراق كلها ملخبطة مع بعض",
        "example_english": "All the papers are mixed up together",
        "category": "descriptive",
        "level": "intermediate"
    },
    {
        "word": "معقول",
        "pronunciation": "Ma'qool",
        "meaning": "هل هذا من الممكن؟ منطقي؟",
        "english": "Really? Is it possible? Reasonable?",
        "example": "معقول انت ما بتعرف الجواب؟",
        "example_english": "Really? You don't know the answer?",
        "category": "expression",
        "level": "beginner"
    },
    {
        "word": "تمام",
        "pronunciation": "Tamam",
        "meaning": "حسناً، ممتاز، كويس",
        "english": "Okay, perfect, alright, fine",
        "example": "تمام يا جماعة، الخطة واضحة",
        "example_english": "Alright guys, the plan is clear",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "كويس",
        "pronunciation": "Kwayyes",
        "meaning": "جيد، ممتاز، حسن",
        "english": "Good, well, fine, okay",
        "example": "الشغل كويس والراتب معقول",
        "example_english": "The work is good and the salary is reasonable",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "وحش",
        "pronunciation": "Wahsh",
        "meaning": "سيء، فظيع",
        "english": "Bad, terrible, awful",
        "example": "الطقس وحش النهاردة والشارع زحمة",
        "example_english": "The weather is terrible today and the street is crowded",
        "category": "descriptive",
        "level": "beginner"
    },
    {
        "word": "غالي",
        "pronunciation": "Ghali",
        "meaning": "مرتفع السعر / زحمة",
        "english": "Expensive, high priced / crowded",
        "example": "الشارع غالي والأسعار مرتفعة",
        "example_english": "The street is crowded and prices are high",
        "category": "descriptive",
        "level": "intermediate"
    },
    {
        "word": "إيه",
        "pronunciation": "Eh",
        "meaning": "ماذا؟",
        "english": "What?",
        "example": "إيه اللي انت بتقول؟",
        "example_english": "What are you saying?",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "تسلم إيدك / عاشت إيدك",
        "pronunciation": "Teslam Edak",
        "meaning": "شكراً على العمل الجيد",
        "english": "Well done! Great job! Thank you!",
        "example": "تسلم إيدك على الأكلة الحلوة دي",
        "example_english": "Well done on this delicious meal",
        "category": "expression",
        "level": "intermediate"
    },
    {
        "word": "ياااه",
        "pronunciation": "Yaaah",
        "meaning": "تعبير مفاجأة أو استغراب",
        "english": "Wow! Gosh! Oh my!",
        "example": "ياااه، الحاجة دي غالية جداً",
        "example_english": "Wow, this thing is very expensive",
        "category": "expression",
        "level": "beginner"
    },
    {
        "word": "خلاص",
        "pronunciation": "Khlas",
        "meaning": "انتهى، كفاية",
        "english": "That's it, enough, finished",
        "example": "خلاص يا جماعة، توقفوا عن الكلام",
        "example_english": "That's it guys, stop talking",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "يلا",
        "pronunciation": "Yalla",
        "meaning": "هيا، بسرعة، تعال",
        "english": "Come on, hurry up, let's go",
        "example": "يلا بينا نروح البيت",
        "example_english": "Come on, let's go home",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "ماشي",
        "pronunciation": "Mashi",
        "meaning": "حسناً، تمام، موافق",
        "english": "Okay, alright, agreed",
        "example": "ماشي يا جماعة، الخطة اتوضحت",
        "example_english": "Alright guys, the plan is clear",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "زي",
        "pronunciation": "Zy",
        "meaning": "مثل، مشابه",
        "english": "Like, similar, same as",
        "example": "الشغل زي ما قلت لك",
        "example_english": "The work is like I told you",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "بس",
        "pronunciation": "Bas",
        "meaning": "لكن، فقط",
        "english": "But, only, just",
        "example": "الفكرة كويسة بس ما عندناش فلوس",
        "example_english": "The idea is good but we don't have money",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "محدش",
        "pronunciation": "Mahdesh",
        "meaning": "لا أحد",
        "english": "Nobody, no one",
        "example": "محدش عرف الإجابة غير الشاطر",
        "example_english": "Nobody knew the answer except the smart one",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "حاجة",
        "pronunciation": "Haja",
        "meaning": "شيء، غرض",
        "english": "Thing, something",
        "example": "أنا محتاج حاجة من المحل",
        "example_english": "I need something from the store",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "شنطة",
        "pronunciation": "Shanta",
        "meaning": "حقيبة",
        "english": "Bag, suitcase",
        "example": "جيب الشنطة من العربية",
        "example_english": "Bring the bag from the car",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "تعبان",
        "pronunciation": "Ta'aban",
        "meaning": "متعب، مرهق",
        "english": "Tired, exhausted, worn out",
        "example": "أنا تعبان جداً من الشغل",
        "example_english": "I'm very tired from work",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "شاطر",
        "pronunciation": "Shater",
        "meaning": "ذكي، ماهر",
        "english": "Smart, clever, skilled",
        "example": "الولد شاطر جداً في المدرسة",
        "example_english": "The boy is very smart at school",
        "category": "descriptive",
        "level": "intermediate"
    },
    {
        "word": "زعلان",
        "pronunciation": "Za'lan",
        "meaning": "مزعوج، حزين",
        "english": "Upset, bothered, annoyed",
        "example": "أنا زعلان منك لأنك تأخرت",
        "example_english": "I'm upset with you because you were late",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "جوعان",
        "pronunciation": "Jou'an",
        "meaning": "جائع، يريد طعام",
        "english": "Hungry, starving",
        "example": "أنا جوعان عايز أكل",
        "example_english": "I'm hungry, I want to eat",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "عطشان",
        "pronunciation": "Ata'shan",
        "meaning": "عطشان، يريد ماء",
        "english": "Thirsty, parched",
        "example": "أنا عطشان جداً هات ماية لو سمحت",
        "example_english": "I'm very thirsty, bring water please",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "نعسان",
        "pronunciation": "Na'san",
        "meaning": "نعسان، متعب يريد النوم",
        "english": "Sleepy, drowsy, tired",
        "example": "أنا نعسان وما بقدر أركز",
        "example_english": "I'm sleepy and can't concentrate",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "بتاع",
        "pronunciation": "Bita'",
        "meaning": "ملك، خاص بـ",
        "english": "Belonging to, of, related to",
        "example": "الكتاب دا بتاع من؟",
        "example_english": "Whose book is this?",
        "category": "common",
        "level": "beginner"
    },
    {
        "word": "على جنب يا اسطى",
        "pronunciation": "Ala Gamb ya Osta",
        "meaning": "طلب التوقف للميكروباص أو التاكسي",
        "english": "Pull over right here driver",
        "example": "على جنب يا اسطى من فضلك عند المحطة",
        "example_english": "Pull over here driver please at the station",
        "category": "expression",
        "level": "beginner"
    },
    {
        "word": "بكم ده؟",
        "pronunciation": "Bikam dah?",
        "meaning": "كم سعر هذا المنتج؟",
        "english": "How much is this?",
        "example": "بكم الكيلو ده يا معلم؟",
        "example_english": "How much is a kilo of this sir?",
        "category": "common",
        "level": "beginner"
    }
]

file_path = os.path.join(data_dir, "egyptian_dictionary.json")
with open(file_path, "w", encoding="utf-8") as f:
    json.dump({"expressions": egyptian_expressions, "count": len(egyptian_expressions)}, f, ensure_ascii=False, indent=2)

print(f"Successfully created {file_path} with {len(egyptian_expressions)} dialect entries.")
