package com.saleem.app.core.data.local.dao

import androidx.room.*
import com.saleem.app.core.data.local.entity.*
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {
    @Query("SELECT * FROM users WHERE id = :userId")
    suspend fun getUserById(userId: String): UserEntity?

    @Query("SELECT * FROM users LIMIT 1")
    fun getActiveUserFlow(): Flow<UserEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: UserEntity)

    @Query("DELETE FROM users")
    suspend fun clearUsers()
}

@Dao
interface TranslationDao {
    @Query("SELECT * FROM translations ORDER BY timestamp DESC")
    fun getAllTranslations(): Flow<List<TranslationEntity>>

    @Query("SELECT * FROM translations WHERE isFavorite = 1 ORDER BY timestamp DESC")
    fun getFavoriteTranslations(): Flow<List<TranslationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTranslation(translation: TranslationEntity)

    @Query("UPDATE translations SET isFavorite = :isFav WHERE id = :id")
    suspend fun updateFavorite(id: String, isFav: Boolean)

    @Query("DELETE FROM translations WHERE id = :id")
    suspend fun deleteTranslation(id: String)
}

@Dao
interface CultureDao {
    @Query("SELECT * FROM culture_guides")
    fun getAllGuides(): Flow<List<CultureGuideEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGuides(guides: List<CultureGuideEntity>)

    @Query("UPDATE culture_guides SET completed = :completed, quizScore = :score WHERE id = :id")
    suspend fun updateGuideProgress(id: String, completed: Boolean, score: Int)
}

@Dao
interface LearningDao {
    @Query("SELECT * FROM courses")
    fun getAllCourses(): Flow<List<CourseEntity>>

    @Query("SELECT * FROM lessons WHERE courseId = :courseId ORDER BY id ASC")
    fun getLessonsForCourse(courseId: String): Flow<List<LessonEntity>>

    @Query("SELECT * FROM enrollments WHERE userId = :userId")
    fun getUserEnrollments(userId: String): Flow<List<EnrollmentEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCourses(courses: List<CourseEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLessons(lessons: List<LessonEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveEnrollment(enrollment: EnrollmentEntity)
}

@Dao
interface ServiceDao {
    @Query("SELECT * FROM services WHERE category = :category OR :category = 'All'")
    fun getServicesByCategory(category: String): Flow<List<ServiceEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertServices(services: List<ServiceEntity>)

    @Query("UPDATE services SET isBookmarked = :bookmarked WHERE id = :id")
    suspend fun updateBookmark(id: String, bookmarked: Boolean)
}

@Dao
interface CommunityDao {
    @Query("SELECT * FROM questions ORDER BY timestamp DESC")
    fun getQuestions(): Flow<List<QuestionEntity>>

    @Query("SELECT * FROM answers WHERE questionId = :questionId ORDER BY upvotes DESC")
    fun getAnswersForQuestion(questionId: String): Flow<List<AnswerEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQuestion(question: QuestionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAnswer(answer: AnswerEntity)

    @Query("UPDATE questions SET upvotes = upvotes + 1 WHERE id = :id")
    suspend fun upvoteQuestion(id: String)
}
