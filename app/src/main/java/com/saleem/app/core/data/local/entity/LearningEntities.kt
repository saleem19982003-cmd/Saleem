package com.saleem.app.core.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "courses")
data class CourseEntity(
    @PrimaryKey val id: String,
    val title: String,
    val category: String,
    val level: String,
    val durationMinutes: Int,
    val description: String,
    val image: String
)

@Entity(tableName = "lessons")
data class LessonEntity(
    @PrimaryKey val id: String,
    val courseId: String,
    val title: String,
    val videoUrl: String,
    val durationMinutes: Int,
    val isCompleted: Boolean = false
)

@Entity(tableName = "enrollments")
data class EnrollmentEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val courseId: String,
    val enrollmentDate: Long = System.currentTimeMillis(),
    val progressPercentage: Int = 0,
    val isCompleted: Boolean = false
)
