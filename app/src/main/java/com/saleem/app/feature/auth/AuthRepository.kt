package com.saleem.app.feature.auth

import com.saleem.app.core.data.local.SessionManager
import com.saleem.app.core.data.local.dao.UserDao
import com.saleem.app.core.data.local.entity.UserEntity
import kotlinx.coroutines.flow.Flow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val userDao: UserDao,
    private val sessionManager: SessionManager
) {
    val activeUser: Flow<UserEntity?> = userDao.getActiveUserFlow()

    suspend fun login(phoneOrEmail: String, pass: String): Result<UserEntity> {
        return try {
            val userId = UUID.randomUUID().toString()
            val user = UserEntity(
                id = userId,
                name = phoneOrEmail.substringBefore("@").replace(".", " ").capitalize(),
                email = if (phoneOrEmail.contains("@")) phoneOrEmail else "$phoneOrEmail@saleem.app",
                phone = if (!phoneOrEmail.contains("@")) phoneOrEmail else "+201000000000",
                nationality = "Sudan",
                language = "Arabic (Egyptian)",
                isVerified = true,
                biometricEnabled = true
            )
            val generatedToken = "jwt_" + UUID.randomUUID().toString()
            userDao.insertUser(user)
            sessionManager.saveAuthToken(generatedToken)
            sessionManager.saveUserId(user.id)
            Result.success(user)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun register(
        name: String,
        email: String,
        phone: String,
        nationality: String,
        language: String
    ): Result<UserEntity> {
        return try {
            val newUserId = UUID.randomUUID().toString()
            val newUser = UserEntity(
                id = newUserId,
                name = name,
                email = email,
                phone = phone,
                nationality = nationality,
                language = language,
                isVerified = true
            )
            val generatedToken = "jwt_" + UUID.randomUUID().toString()
            userDao.insertUser(newUser)
            sessionManager.saveAuthToken(generatedToken)
            sessionManager.saveUserId(newUserId)
            Result.success(newUser)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun logout() {
        userDao.clearUsers()
        sessionManager.clearSession()
    }
}
