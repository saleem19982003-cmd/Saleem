package com.saleem.app.core.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "culture_guides")
data class CultureGuideEntity(
    @PrimaryKey val id: String,
    val title: String,
    val category: String,
    val description: String,
    val content: String,
    val difficulty: String,
    val completed: Boolean = false,
    val quizScore: Int = 0
)
