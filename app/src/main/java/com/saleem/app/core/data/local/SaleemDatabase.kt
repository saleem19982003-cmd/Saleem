package com.saleem.app.core.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.saleem.app.core.data.local.dao.*
import com.saleem.app.core.data.local.entity.*

@Database(
    entities = [
        UserEntity::class,
        TranslationEntity::class,
        CultureGuideEntity::class,
        CourseEntity::class,
        LessonEntity::class,
        EnrollmentEntity::class,
        ServiceEntity::class,
        QuestionEntity::class,
        AnswerEntity::class,
        EventEntity::class,
        BookmarkEntity::class,
        PreferencesEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class SaleemDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun translationDao(): TranslationDao
    abstract fun cultureDao(): CultureDao
    abstract fun learningDao(): LearningDao
    abstract fun serviceDao(): ServiceDao
    abstract fun communityDao(): CommunityDao
}
