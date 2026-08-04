package com.saleem.app.core.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "questions")
data class QuestionEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val authorName: String,
    val title: String,
    val description: String,
    val category: String,
    val timestamp: Long = System.currentTimeMillis(),
    val upvotes: Int = 0,
    val answerCount: Int = 0,
    val isResolved: Boolean = false
)

@Entity(tableName = "answers")
data class AnswerEntity(
    @PrimaryKey val id: String,
    val questionId: String,
    val userId: String,
    val authorName: String,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val upvotes: Int = 0,
    val isAccepted: Boolean = false
)

@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey val id: String,
    val title: String,
    val description: String,
    val eventType: String,
    val date: Long,
    val location: String,
    val organizer: String,
    val attendeeCount: Int = 0,
    val isAttending: Boolean = false
)
