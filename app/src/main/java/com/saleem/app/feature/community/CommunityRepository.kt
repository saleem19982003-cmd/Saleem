package com.saleem.app.feature.community

import com.saleem.app.core.data.local.dao.CommunityDao
import com.saleem.app.core.data.local.entity.QuestionEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

data class VolunteerProfile(
    val name: String,
    val languages: List<String>,
    val specializations: List<String>,
    val rating: Float
)

@Singleton
class CommunityRepository @Inject constructor(
    private val communityDao: CommunityDao
) {
    val questions: Flow<List<QuestionEntity>> = communityDao.getQuestions()

    val volunteers = listOf(
        VolunteerProfile("Tariq Al-Mansoor", listOf("Arabic", "English", "Amharic"), listOf("Legal Advice", "Document Translation"), 4.9f),
        VolunteerProfile("Fatima Idris", listOf("Arabic", "Somali", "French"), listOf("Healthcare Navigation", "Housing Search"), 4.8f),
        VolunteerProfile("Michael Deng", listOf("Arabic", "English", "Tigrinya"), listOf("Youth Mentorship", "Coding Tutor"), 5.0f)
    )

    val initialQuestions = listOf(
        QuestionEntity(
            id = "q_101",
            userId = "usr_99",
            authorName = "Omer K.",
            title = "Where can I find affordable Arabic language classes in Maadi?",
            description = "Looking for beginner Egyptian colloquial Arabic courses starting next month.",
            category = "Education",
            upvotes = 12,
            answerCount = 4
        ),
        QuestionEntity(
            id = "q_102",
            userId = "usr_88",
            authorName = "Sarah M.",
            title = "What is the procedure for enrolling refugee children in Cairo public schools?",
            description = "Need clarification on required stamp certifications from the Ministry of Education.",
            category = "Government",
            upvotes = 28,
            answerCount = 9
        )
    )

    suspend fun seedInitialQuestions() {
        initialQuestions.forEach { communityDao.insertQuestion(it) }
    }

    suspend fun askQuestion(title: String, desc: String, category: String) {
        val q = QuestionEntity(
            id = "q_" + System.currentTimeMillis(),
            userId = "usr_active",
            authorName = "Active User",
            title = title,
            description = desc,
            category = category
        )
        communityDao.insertQuestion(q)
    }

    suspend fun upvote(questionId: String) {
        communityDao.upvoteQuestion(questionId)
    }
}
