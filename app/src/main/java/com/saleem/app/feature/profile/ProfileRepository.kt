package com.saleem.app.feature.profile

import com.saleem.app.core.data.local.dao.UserDao
import com.saleem.app.core.data.local.entity.UserEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val userDao: UserDao
) {
    val activeUser: Flow<UserEntity?> = userDao.getActiveUserFlow()

    suspend fun updateProfile(name: String, language: String, nationality: String) {
        val currentUser = userDao.getUserById("usr_active")
        if (currentUser != null) {
            val updated = currentUser.copy(name = name, language = language, nationality = nationality)
            userDao.insertUser(updated)
        }
    }
}
