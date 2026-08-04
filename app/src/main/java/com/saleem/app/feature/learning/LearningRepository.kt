package com.saleem.app.feature.learning

import com.saleem.app.core.data.local.dao.LearningDao
import com.saleem.app.core.data.local.entity.CourseEntity
import com.saleem.app.core.data.local.entity.EnrollmentEntity
import com.saleem.app.core.data.local.entity.LessonEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LearningRepository @Inject constructor(
    private val learningDao: LearningDao
) {
    val courses: Flow<List<CourseEntity>> = learningDao.getAllCourses()

    val initialCourses = listOf(
        CourseEntity(
            id = "crs_1",
            title = "Web Development Fundamentals (HTML/CSS & JavaScript)",
            category = "Web Development",
            level = "Beginner",
            durationMinutes = 480,
            description = "Build real responsive websites and web applications from scratch. Tailored for beginners with zero prior coding experience.",
            image = "web_dev.jpg"
        ),
        CourseEntity(
            id = "crs_2",
            title = "Android App Development with Kotlin & Jetpack Compose",
            category = "Mobile Development",
            level = "Intermediate",
            durationMinutes = 620,
            description = "Master modern Android development using Kotlin, MVVM architecture, Jetpack Compose UI, and REST APIs.",
            image = "android_dev.jpg"
        ),
        CourseEntity(
            id = "crs_3",
            title = "Digital Literacy & Professional Remote Work Tools",
            category = "Digital Literacy",
            level = "Beginner",
            durationMinutes = 240,
            description = "Learn Google Workspace, Zoom, remote job searching, CV creation, and online safety essentials.",
            image = "digital_lit.jpg"
        )
    )

    val initialLessons = listOf(
        LessonEntity("l_1", "crs_1", "Introduction to HTML Structure & Tags", "https://youtube.com/watch?v=demo1", 30),
        LessonEntity("l_2", "crs_1", "Styling Web Pages with CSS Flexbox", "https://youtube.com/watch?v=demo2", 45),
        LessonEntity("l_3", "crs_1", "JavaScript Fundamentals & DOM Manipulation", "https://youtube.com/watch?v=demo3", 60)
    )

    suspend fun seedInitialData() {
        learningDao.insertCourses(initialCourses)
        learningDao.insertLessons(initialLessons)
    }

    suspend fun enrollInCourse(courseId: String) {
        val enrollment = EnrollmentEntity(
            id = "enr_" + System.currentTimeMillis(),
            userId = "usr_active",
            courseId = courseId,
            progressPercentage = 35
        )
        learningDao.saveEnrollment(enrollment)
    }
}
