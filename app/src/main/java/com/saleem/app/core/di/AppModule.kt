package com.saleem.app.core.di

import android.content.Context
import androidx.room.Room
import com.saleem.app.core.data.local.SaleemDatabase
import com.saleem.app.core.data.local.dao.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideSaleemDatabase(@ApplicationContext context: Context): SaleemDatabase {
        return Room.databaseBuilder(
            context,
            SaleemDatabase::class.java,
            "saleem_db"
        ).fallbackToDestructiveMigration().build()
    }

    @Provides
    fun provideUserDao(db: SaleemDatabase): UserDao = db.userDao()

    @Provides
    fun provideTranslationDao(db: SaleemDatabase): TranslationDao = db.translationDao()

    @Provides
    fun provideCultureDao(db: SaleemDatabase): CultureDao = db.cultureDao()

    @Provides
    fun provideLearningDao(db: SaleemDatabase): LearningDao = db.learningDao()

    @Provides
    fun provideServiceDao(db: SaleemDatabase): ServiceDao = db.serviceDao()

    @Provides
    fun provideCommunityDao(db: SaleemDatabase): CommunityDao = db.communityDao()
}
