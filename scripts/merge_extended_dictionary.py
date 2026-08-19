import json
import os

data_dir = r"d:\Saleem\data"
os.makedirs(data_dir, exist_ok=True)

# Parse extended expressions
extended_entries = [
    # Clothing
    {"word": "قميص", "pronunciation": "Qamis", "meaning": "قميص، ملابس الذكور", "english": "Shirt, dress shirt", "example": "القميص الأبيض والكم طويل", "example_english": "The white shirt and long sleeves", "category": "clothing", "level": "beginner"},
    {"word": "جلابية", "pronunciation": "Jellabiya", "meaning": "ملابس تقليدية مصرية", "english": "Traditional Egyptian robe", "example": "الجلابية الزرقاء والنسيج ناعم", "example_english": "The blue robe and soft fabric", "category": "clothing", "level": "beginner"},
    {"word": "طاقية", "pronunciation": "Taqiya", "meaning": "قبعة، غطاء الرأس", "english": "Cap, hat, skullcap", "example": "الطاقية السوداء والنسيج سميك", "example_english": "Black cap and thick fabric", "category": "clothing", "level": "beginner"},
    {"word": "حجاب", "pronunciation": "Hijab", "meaning": "غطاء الرأس الإسلامي", "english": "Islamic headscarf", "example": "الحجاب الملون والأسلوب حديث", "example_english": "Colored hijab and modern style", "category": "clothing", "level": "beginner"},
    {"word": "إيشارب", "pronunciation": "Isharp", "meaning": "شال أو وشاح", "english": "Scarf, shawl", "example": "الإيشارب الأحمر والنسيج حرير", "example_english": "Red scarf and silk fabric", "category": "clothing", "level": "beginner"},
    {"word": "شرابات", "pronunciation": "Sharabat", "meaning": "جوارب", "english": "Socks, stockings", "example": "الشرابات البيضاء والقدم دافية", "example_english": "White socks and warm feet", "category": "clothing", "level": "beginner"},
    {"word": "حذاء / جزمة", "pronunciation": "Jazma / Hizaa", "meaning": "حذاء", "english": "Shoe, footwear", "example": "الجزمة السوداء شيك جداً", "example_english": "The black shoes are very stylish", "category": "clothing", "level": "beginner"},
    {"word": "حزام", "pronunciation": "Hizam", "meaning": "حزام الخصر", "english": "Belt, waist belt", "example": "الحزام الأسود والجلد ممتاز", "example_english": "Black belt and excellent leather", "category": "clothing", "level": "beginner"},
    {"word": "كرافتة", "pronunciation": "Krafta", "meaning": "ربطة عنق", "english": "Necktie, tie", "example": "الكرافتة الحمراء والشغل رسمي", "example_english": "Red tie and formal work", "category": "clothing", "level": "beginner"},
    {"word": "بطانية", "pronunciation": "Betanya", "meaning": "غطاء السرير", "english": "Blanket, bedcover", "example": "البطانية الصوف والدفء كويس", "example_english": "Wool blanket and warm", "category": "clothing", "level": "beginner"},

    # Animals
    {"word": "كلب", "pronunciation": "Kalb", "meaning": "كلب، حيوان أليف", "english": "Dog", "example": "الكلب بتاع الجار بيعوي", "example_english": "The neighbor's dog barks", "category": "animals", "level": "beginner"},
    {"word": "قطة", "pronunciation": "Qatta", "meaning": "قط، حيوان أليف", "english": "Cat", "example": "القطة السوداء والعيون خضراء", "example_english": "Black cat and green eyes", "category": "animals", "level": "beginner"},
    {"word": "عصفور", "pronunciation": "Asfur", "meaning": "طير صغير", "english": "Sparrow, small bird", "example": "العصفور بيغني فوق الشجرة", "example_english": "The bird is singing on the tree", "category": "animals", "level": "beginner"},
    {"word": "حمام", "pronunciation": "Hamam", "meaning": "حمام، طير أبيض", "english": "Pigeon, dove", "example": "الحمام الأبيض محشي رز", "example_english": "Stuffed pigeon with rice", "category": "animals", "level": "beginner"},
    {"word": "سمكة", "pronunciation": "Samaka", "meaning": "سمك، كائن مائي", "english": "Fish", "example": "السمكة المشوية طازة وممتازة", "example_english": "Grilled fish is fresh and excellent", "category": "animals", "level": "beginner"},
    {"word": "جمل", "pronunciation": "Jamal", "meaning": "جمل، حيوان صحراوي", "english": "Camel", "example": "الجمل سفينة الصحراء", "example_english": "The camel is the ship of the desert", "category": "animals", "level": "beginner"},
    {"word": "حصان", "pronunciation": "Hisan", "meaning": "حصان، حيوان ركوب", "english": "Horse", "example": "الحصان العربي سريع جداً", "example_english": "The Arabian horse is very fast", "category": "animals", "level": "beginner"},
    {"word": "بقرة", "pronunciation": "Baqara", "meaning": "بقر، ماشية", "english": "Cow", "example": "البقرة بتعطي لبن طازة", "example_english": "The cow gives fresh milk", "category": "animals", "level": "beginner"},
    {"word": "خروف", "pronunciation": "Kharuf", "meaning": "خروف، ماشية", "english": "Sheep, lamb", "example": "الخروف والصوف أبيض", "example_english": "The sheep and white wool", "category": "animals", "level": "beginner"},
    {"word": "فيل", "pronunciation": "Fil", "meaning": "فيل، حيوان ضخم", "english": "Elephant", "example": "الفيل الرمادي ضخم جداً", "example_english": "The gray elephant is huge", "category": "animals", "level": "beginner"},

    # Professions
    {"word": "عامل", "pronunciation": "Amil", "meaning": "عامل، مجتهد", "english": "Worker, laborer", "example": "العامل بيشتغل بجد في الموقع", "example_english": "The worker works hard at the site", "category": "professions", "level": "beginner"},
    {"word": "مهندس", "pronunciation": "Muhandis", "meaning": "مهندس متخصص", "english": "Engineer", "example": "المهندس بيصمم المبنى الجديد", "example_english": "The engineer designs the new building", "category": "professions", "level": "beginner"},
    {"word": "طبيب / دكتور", "pronunciation": "Tabib / Doktor", "meaning": "طبيب معالج", "english": "Doctor, physician", "example": "الدكتور فحص المريض وكتب الدواء", "example_english": "The doctor examined the patient and prescribed medicine", "category": "professions", "level": "beginner"},
    {"word": "ممرضة", "pronunciation": "Mumarrida", "meaning": "ممرضة مساعدة", "english": "Nurse", "example": "الممرضة بتهتم بالمرضى في المستشفى", "example_english": "The nurse takes care of patients in hospital", "category": "professions", "level": "beginner"},
    {"word": "معلم / مدرس", "pronunciation": "Mudarris", "meaning": "معلم، مدرس", "english": "Teacher", "example": "المدرس بيشرح الدرس كويس", "example_english": "The teacher explains the lesson well", "category": "professions", "level": "beginner"},
    {"word": "محامي", "pronunciation": "Muhami", "meaning": "محامي قانوني", "english": "Lawyer, attorney", "example": "المحامي بيساعد في القضية والقانون", "example_english": "The lawyer helps with the case and law", "category": "professions", "level": "beginner"},
    {"word": "شرطي / ظابط", "pronunciation": "Zabit / Shurti", "meaning": "رجل أمن", "english": "Police officer", "example": "الظابط بيحمي المنطقة والشوارع", "example_english": "The officer protects the area and streets", "category": "professions", "level": "beginner"},
    {"word": "سائق / اسطى", "pronunciation": "Osta / Sa'iq", "meaning": "سائق الميكروباص أو التاكسي", "english": "Driver, taxi/microbus driver", "example": "الاسطى سايق الميكروباص بحرفية", "example_english": "The driver is driving the microbus skillfully", "category": "professions", "level": "beginner"},
    {"word": "ميكانيكي", "pronunciation": "Mekaniki", "meaning": "صيانة السيارات", "english": "Mechanic", "example": "الميكانيكي صلح العربية في الورشة", "example_english": "The mechanic fixed the car at the workshop", "category": "professions", "level": "beginner"},
    {"word": "سباك", "pronunciation": "Sabbak", "meaning": "متخصص السباكة والأنابيب", "english": "Plumber", "example": "السباك صلح حنفية المطبخ", "example_english": "The plumber fixed the kitchen tap", "category": "professions", "level": "beginner"},
    {"word": "نجار", "pronunciation": "Najjar", "meaning": "متخصص الخشب والأثاث", "english": "Carpenter", "example": "النجار عمل دولاب خشب ممتاز", "example_english": "The carpenter made an excellent wooden wardrobe", "category": "professions", "level": "beginner"},
    {"word": "كهربائي", "pronunciation": "Kahraba'i", "meaning": "متخصص الكهرباء", "english": "Electrician", "example": "الكهربائي ركب الإضاءة الجديدة", "example_english": "The electrician installed the new lighting", "category": "professions", "level": "beginner"},

    # Sports
    {"word": "كرة قدم", "pronunciation": "Kora qadam", "meaning": "رياضة كرة القدم", "english": "Football, soccer", "example": "كرة القدم هي اللعبة الشعبية الأولى في مصر", "example_english": "Football is the most popular game in Egypt", "category": "sports", "level": "beginner"},
    {"word": "كرة السلة", "pronunciation": "Kora al-sala", "meaning": "كرة السلة", "english": "Basketball", "example": "كرة السلة محتاجة طول ومرونة", "example_english": "Basketball needs height and flexibility", "category": "sports", "level": "beginner"},
    {"word": "سباحة", "pronunciation": "Sibaha", "meaning": "رياضة السباحة في الماء", "english": "Swimming", "example": "السباحة ممتازة للصحة والجسم", "example_english": "Swimming is great for health and body", "category": "sports", "level": "beginner"},
    {"word": "ملاكمة", "pronunciation": "Mulaakama", "meaning": "رياضة القتال بالقفازات", "english": "Boxing", "example": "الملاكمة محتاجة لياقة وقوة", "example_english": "Boxing requires fitness and strength", "category": "sports", "level": "beginner"}
]

# Load existing base dictionary if available
base_file = os.path.join(data_dir, "egyptian_dictionary.json")
existing_expressions = []
if os.path.exists(base_file):
    with open(base_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        existing_expressions = data.get("expressions", [])

# Combine and deduplicate
seen_words = set()
all_expressions = []

for item in existing_expressions + extended_entries:
    word = item["word"].strip()
    if word not in seen_words:
        seen_words.add(word)
        all_expressions.append(item)

# Save combined complete dictionary
merged_path = os.path.join(data_dir, "egyptian_dialect_extended_5000.json")
with open(merged_path, "w", encoding="utf-8") as f:
    json.dump({
        "metadata": {
            "name": "Extended Egyptian Arabic Dialect Dictionary",
            "version": "2.0",
            "total_entries": len(all_expressions),
            "categories": ["common", "slang", "descriptive", "expression", "clothing", "animals", "professions", "sports"]
        },
        "expressions": all_expressions
    }, f, ensure_ascii=False, indent=2)

# Also update main egyptian_dictionary.json
with open(base_file, "w", encoding="utf-8") as f:
    json.dump({"expressions": all_expressions, "count": len(all_expressions)}, f, ensure_ascii=False, indent=2)

print(f"Successfully merged extended dictionary! Total entries: {len(all_expressions)}")
