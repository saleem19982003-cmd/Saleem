package com.saleem.app.core.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "translations")
data class TranslationEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val sourceText: String,
    val sourceLang: String,
    val targetText: String,
    val targetLang: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isFavorite: Boolean = false,
    val contextNotes: String = ""
)
