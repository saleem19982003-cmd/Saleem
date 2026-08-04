package com.saleem.app.feature.translator

import com.saleem.app.core.data.local.dao.TranslationDao
import com.saleem.app.core.data.local.entity.TranslationEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

data class SlangEntry(
    val word: String,
    val dialect: String,
    val translation: String,
    val context: String,
    val example: String
)

@Singleton
class TranslationRepository @Inject constructor(
    private val translationDao: TranslationDao
) {
    val history: Flow<List<TranslationEntity>> = translationDao.getAllTranslations()
    val favorites: Flow<List<TranslationEntity>> = translationDao.getFavoriteTranslations()

    val supportedLanguages = listOf(
        "English",
        "Arabic (Egyptian / Sudanese)",
        "Amharic (አማርኛ)",
        "Somali (Soomaali)",
        "French (Français)",
        "Tigrinya (ትግርኛ)",
        "Swahili (Kiswahili)",
        "Hausa",
        "Oromo (Afaan Oromoo)",
        "Yoruba",
        "Igbo",
        "Wolof",
        "Lingala",
        "Zulu (isiZulu)"
    )

    val slangDictionary = listOf(
        SlangEntry("Malish", "Egyptian / Sudanese Arabic", "It's okay / Never mind / Don't worry", "Used to comfort someone or brush off a minor issue.", "Malish, everything will be fine tomorrow."),
        SlangEntry("Khalaas", "Arabic", "Finished / Done / Enough", "Used to signal completion or to tell someone to stop.", "Khalaas, I completed the registration form."),
        SlangEntry("Yalla", "Arabic", "Let's go / Come on", "Used to encourage action or prompt movement.", "Yalla, let's go to the Cairo metro station."),
        SlangEntry("Mabrouk", "Arabic", "Congratulations", "Used during celebrations, passing exams, or good news.", "Mabrouk on passing your language test!"),
        SlangEntry("Selam", "Amharic / Tigrinya", "Peace / Hello / Greetings", "Universal warm greeting across Ethiopia and Eritrea.", "Selam! How are you doing today?"),
        SlangEntry("Ameseginalehu", "Amharic", "Thank you very much", "Polite expression of gratitude in Amharic.", "Ameseginalehu for your guidance."),
        SlangEntry("Nabad", "Somali", "Peace / Hello", "Standard friendly Somali greeting.", "Nabad! Welcome to our community."),
        SlangEntry("Mahadsanid", "Somali", "Thank you", "Expression of gratitude in Somali.", "Mahadsanid for helping me with housing."),
        SlangEntry("Jambo / Habari", "Swahili", "Hello / How are you?", "Warm greeting across Kenya, Tanzania, and East Africa.", "Jambo! How is your family?"),
        SlangEntry("Asante sana", "Swahili", "Thank you very much", "Polite gratitude in Swahili.", "Asante sana for the support."),
        SlangEntry("Sannu", "Hausa", "Hello / Greetings", "Common greeting across West Africa.", "Sannu! Glad to meet you."),
        SlangEntry("Nagode", "Hausa", "Thank you", "Expression of thanks in Hausa.", "Nagode for the assistance.")
    )

    suspend fun translateText(sourceText: String, sourceLang: String, targetLang: String): TranslationEntity {
        val lower = sourceText.lowercase()
        val translated = when {
            lower.contains("malish") -> "معليش (Malish - It's okay / Don't worry)"
            lower.contains("khalaas") -> "خلاص (Khalaas - Finished / Done)"
            lower.contains("yalla") -> "يلا (Yalla - Let's go!)"
            lower.contains("selam") -> "ሰላም (Selam - Peace & Greetings)"
            lower.contains("jambo") -> "Jambo (Hello / How are you?)"
            lower.contains("metro") -> "إزاي أروح لمحطة المترو؟ (Cairo Metro Route Guidance)"
            lower.contains("thank") -> "شكراً جزيلاً / Ameseginalehu / Mahadsanid"
            else -> "[$targetLang Dialect Translation] $sourceText"
        }

        val entity = TranslationEntity(
            id = "tr_" + System.currentTimeMillis(),
            userId = "usr_active",
            sourceText = sourceText,
            sourceLang = sourceLang,
            targetText = translated,
            targetLang = targetLang,
            timestamp = System.currentTimeMillis()
        )
        translationDao.insertTranslation(entity)
        return entity
    }

    suspend fun toggleFavorite(id: String, currentFavStatus: Boolean) {
        translationDao.updateFavorite(id, !currentFavStatus)
    }
}
