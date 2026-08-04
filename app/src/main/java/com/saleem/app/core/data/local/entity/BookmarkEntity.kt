package com.saleem.app.core.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "bookmarks")
data class BookmarkEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val resourceId: String,
    val resourceType: String,
    val title: String,
    val bookmarkedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "preferences")
data class PreferencesEntity(
    @PrimaryKey val id: String = "user_prefs",
    val userId: String = "",
    val language: String = "en",
    val theme: String = "system",
    val fontSize: String = "medium",
    val notificationsEnabled: Boolean = true,
    val biometricEnabled: Boolean = false
)
