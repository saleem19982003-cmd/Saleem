package com.saleem.app.core.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val name: String,
    val email: String,
    val phone: String,
    val nationality: String,
    val language: String,
    val profileImage: String = "",
    val registrationDate: Long = System.currentTimeMillis(),
    val isVerified: Boolean = false,
    val biometricEnabled: Boolean = false,
    val lastSyncDate: Long = System.currentTimeMillis()
)
