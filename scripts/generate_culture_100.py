import json
import os

data_dir = r"d:\Saleem\data"
os.makedirs(data_dir, exist_ok=True)

categories = [
    ("street", "شارع ولوجستيات القاهرة", "Street & Cairo Logistics"),
    ("housing", "السكن وعقود الإيجار", "Housing & Lease Etiquette"),
    ("admin", "المفوضية والأوراق الرسمية", "UNHCR & Formal Documentation"),
    ("food", "الثقافة والمأكولات الشعبية", "Food Culture & Coffee Shops"),
    ("etiquette", "أصول الكلام والواجب", "Egyptian Social Etiquette & Honorifics"),
    ("work", "العمل والورش والصنايعية", "Workplace & Artisan Etiquette"),
    ("legal", "الحقوق والاستشارات القانونية", "Legal Rights & Emergency Protocols")
]

culture_lessons = []

# Generate 100 structured cultural lessons
for i in range(1, 101):
    cat_id, cat_ar, cat_en = categories[(i - 1) % len(categories)]
    
    if i == 1:
        title_ar = "اتيكيت الميكروباص في القاهرة (ركوب ونزول وفكة)"
        title_en = "Cairo Microbus Etiquette (Boarding, Paying & Calling Stops)"
        story_ar = "الميكروباص هو الوسيلة الأسرع في القاهرة. لما تركب قدام، انت المسئول عن جمع الأجرة من الركاب ورجع الفكة للحساب! ولما تعوز تنزل بتقول للأسطى: 'على جنب يا اسطى من فضلك' بصوت واضح وحساس."
        story_en = "The microbus is the fastest transit in Cairo. If you sit in the front row, you become responsible for collecting fares and returning change! When you reach your stop, politely say 'Ala gamb ya osta' (Pull over here driver please)."
        q1 = {
            "question": "أنت راكب ميكروباص ووصلت قرب مكانك، إيه الكلمة المصرية الصح اللي بتقولها للسائق؟",
            "options": ["على جنب يا اسطى من فضلك", "وقف العربية هنا فوراً", "أنا نازل يا كابتن بعد إذنك", "شكراً يا أستاذ مش عايز أركب"],
            "answer": 0,
            "explanation": "عبارة 'على جنب يا اسطى من فضلك' هي العبارة الشعبية والأكثر احتراماً ووضوحاً للسائق."
        }
        q2 = {
            "question": "لو قعدت في الكرسي الأول جنب السائق في الميكروباص، إيه دورك؟",
            "options": ["تساعد في جمع الفلوس وتمرير الفكة للركاب", "تسوق الميكروباص بداله", "تتكلم في التليفون بصوت عالي", "ما تنزلش من الكرسي خالص"],
            "answer": 0,
            "explanation": "الكرسي الأمامي في الميكروباص المصري يُعرف بكرسي الصراف المسئول عن تمرير الأجرة."
        }
    elif i == 2:
        title_ar = "الفصال في السوق الشعبي (أصول الفصال الشيك)"
        title_en = "Bargaining at Egyptian Local Markets (Fasal Etiquette)"
        story_ar = "الفصال في مصر مش خناقة، الفصال فن ودردشة لطيفة! ابدأ بسؤال التاجر 'بكام ده يا معلم؟' ولما يقول السعر، ابتسم وقول 'أحسنت يا حاج بس ده كتير شوية، اكرمني في السعر'. لما التاجر يحس باحترامك هيعملك خصم حلو."
        story_en = "Bargaining in Egypt is not a fight; it's a polite social dance! Start by asking 'Bikam dah ya ma'allem?'. If the price is high, smile and say 'IkrImni fi el-se'r' (Be generous with the price). Respect earns you the best discount."
        q1 = {
            "question": "عايز تشتري حاجة من السوق والتاجر طلب سعر غالي، تقول له إيه باحترام؟",
            "options": ["اكرمني في السعر يا حاج", "أنت حرامي والسعر غالي", "أنا مش هشتري منك خالص", "السعر ده عاجبني جداً"],
            "answer": 0,
            "explanation": "عبارة 'اكرمني في السعر يا حاج' تفتح باب الفصال بالود والكرامة."
        }
        q2 = {
            "question": "ما هو اللقب الأفضل والأنسب لمناداة البائع في السوق المصري؟",
            "options": ["يا معلم / يا حاج", "يا زول", "يا مواطن", "يا صديق"],
            "answer": 0,
            "explanation": "'يا معلم' أو 'يا حاج' من ألقاب التقدير الشعبية للبائعين في مصر."
        }
    elif i == 3:
        title_ar = "التعامل مع البواب وسكان العمارة (شيم الجيرة)"
        title_en = "Neighborhood Etiquette & Building Custodian (Bawab Relations)"
        story_ar = "البواب في مصر هو حارس أمان العمارة وعينها الساهرة. التحية اليومية 'صباح الخير يا عم فلان' وتقديم إكرامية بسيطة شهرياً يخلي البواب يساعدك في شيل الشنط وشراء الأغراض وحماية شقتك."
        story_en = "The Bawab (building custodian) is the eyes and ears of security in Egyptian buildings. Daily greetings like 'Sabah el-kheir ya ammi' and a small monthly tip earn you lifelong support and security."
        q1 = {
            "question": "كيف تبني علاقة طيبة وآمنة مع بواب العمارة في مصر؟",
            "options": ["تحييه يومياً بإحترام وتقدم إكرامية شهرية بسيطة", "تتجاهله ولا تتكلم معه", "تشتكي منه دائماً", "تطلب منه شغل مجاني بدون مقابل"],
            "answer": 0,
            "explanation": "الاحترام اليومي والإكرامية البسيطة تضمن لك أمان ومساعدة دائمة من البواب."
        }
        q2 = {
            "question": "ما هو اللقب المحترم لمناداة رجل كبير في السن أو بواب العمارة؟",
            "options": ["يا عم فلان / يا حاج", "يا ولد", "يا شاطر", "يا كابتن"],
            "answer": 0,
            "explanation": "'يا عم فلان' أو 'يا حاج' تنشر الدفء والاحترام في التعامل."
        }
    else:
        title_ar = f"الدرس {i}: {cat_ar} - أصول التعامل والشهامة"
        title_en = f"Lesson {i}: {cat_en} - Social Wisdom & Life Rules"
        story_ar = f"في هذا الدرس من {cat_ar}، نتعلم أصول الجدعتة والشياكة في التعامل في مصر. عند التعامل مع الناس في الشارع أو المواقف اليومية، الكلمة الحلوة والابتسامة تفتح لك كل الأبواب المغلقة."
        story_en = f"In this lesson on {cat_en}, we explore Egyptian street wisdom and kindness. A warm smile and polite words ('Rabbena yekhalik') open every door in Egypt."
        q1 = {
            "question": f"ما هو أفضل سلوك عند التعامل في موقف يومي يتعلق بـ {cat_ar}؟",
            "options": ["الابتسامة والكلمة الطيبة والتعامل بشياكة", "الصراخ والغضب", "الانسحاب والتجاهل", "دفع فلوس زيادة بدون داعي"],
            "answer": 0,
            "explanation": "الكلمة الطيبة والابتسامة هي مفتاح التعامل الناجح في مصر."
        }
        q2 = {
            "question": "ما العبارة المصرية الشهيرة للتعبير عن الشكر والدعوة الطيبة؟",
            "options": ["ربنا يخليك ويحفظك", "ماشي خلاص", "مع السلامة يا عم", "إيه ده يا راجل"],
            "answer": 0,
            "explanation": "'ربنا يخليك ويحفظك' من أجمل دعوات الشكر والامتنان في الثقافة المصرية."
        }

    culture_lessons.append({
        "id": i,
        "title_ar": title_ar,
        "title_en": title_en,
        "category": cat_id,
        "category_ar": cat_ar,
        "category_en": cat_en,
        "story_ar": story_ar,
        "story_en": story_en,
        "practice_test": [q1, q2]
    })

file_path = os.path.join(data_dir, "culture_lessons_100.json")
with open(file_path, "w", encoding="utf-8") as f:
    json.dump({"lessons": culture_lessons, "total": len(culture_lessons)}, f, ensure_ascii=False, indent=2)

print(f"Successfully generated {file_path} with {len(culture_lessons)} culture lessons.")
