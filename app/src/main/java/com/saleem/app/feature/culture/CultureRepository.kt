package com.saleem.app.feature.culture

import com.saleem.app.core.data.local.dao.CultureDao
import com.saleem.app.core.data.local.entity.CultureGuideEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

data class QuizQuestion(
    val id: String,
    val question: String,
    val options: List<String>,
    val correctAnswerIndex: Int,
    val explanation: String
)

@Singleton
class CultureRepository @Inject constructor(
    private val cultureDao: CultureDao
) {
    val guides: Flow<List<CultureGuideEntity>> = cultureDao.getAllGuides()

    val initialGuides = listOf(
        CultureGuideEntity(
            id = "c_1",
            title = "Egyptian Greeting Customs & Hospitality",
            category = "Egyptian Customs",
            description = "Learn how to greet neighbors, colleagues, and elders gracefully in Egyptian society.",
            content = "Greetings in Egypt carry deep cultural warmth. 'Assalamou Alaikum' (Peace be upon you) is standard. Handshakes are customary among the same gender. When entering a home, removing shoes is polite, and accepting offered tea/coffee honors your host.",
            difficulty = "Beginner"
        ),
        CultureGuideEntity(
            id = "c_2",
            title = "Navigating Public Transport: Metro, Microbuses & Taxis",
            category = "Public Transportation",
            description = "Master Cairo & Alexandria transit systems with ease.",
            content = "Microbuses use hand signals for destinations. The metro is color-coded with middle cars reserved for women. Always keep small EGP change (5, 10, 20 pound notes) handy for fare payment.",
            difficulty = "Intermediate"
        ),
        CultureGuideEntity(
            id = "c_3",
            title = "Bargaining & Market Etiquette in Khan el-Khalili & Local Souks",
            category = "Etiquette Guide",
            description = "Friendly negotiation rules for everyday shopping.",
            content = "Polite bargaining is normal in traditional open-air markets. Always begin with a warm smile and greeting. Never haggle at fixed-price supermarkets or pharmacies.",
            difficulty = "Beginner"
        )
    )

    val sampleQuiz = listOf(
        QuizQuestion(
            id = "q1",
            question = "Which metro cars are typically designated exclusively for female passengers?",
            options = listOf("The front car only", "The middle cars", "The last car", "None"),
            correctAnswerIndex = 1,
            explanation = "Cairo Metro features middle cars clearly marked for women, offering extra comfort."
        ),
        QuizQuestion(
            id = "q2",
            question = "What is the polite response when someone greets you with 'Assalamou Alaikum'?",
            options = listOf("Malish", "Wa Alaikum Assalam", "Yalla", "Shukran"),
            correctAnswerIndex = 1,
            explanation = "'Wa Alaikum Assalam' (And upon you be peace) is the warm standard response."
        )
    )

    suspend fun initDefaultGuidesIfEmpty() {
        cultureDao.insertGuides(initialGuides)
    }

    suspend fun updateProgress(guideId: String, score: Int) {
        cultureDao.updateGuideProgress(guideId, completed = true, score = score)
    }
}
