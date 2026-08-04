package com.saleem.app.feature.learning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.saleem.app.core.data.local.entity.CourseEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LearningViewModel @Inject constructor(
    private val repository: LearningRepository
) : ViewModel() {

    val courses: StateFlow<List<CourseEntity>> = repository.courses.stateIn(
        viewModelScope, SharingStarted.WhileSubsubscribed(5000), repository.initialCourses
    )

    init {
        viewModelScope.launch {
            repository.seedInitialData()
        }
    }

    fun enroll(courseId: String) {
        viewModelScope.launch {
            repository.enrollInCourse(courseId)
        }
    }
}
