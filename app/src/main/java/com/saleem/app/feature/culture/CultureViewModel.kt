package com.saleem.app.feature.culture

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.saleem.app.core.data.local.entity.CultureGuideEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CultureViewModel @Inject constructor(
    private val repository: CultureRepository
) : ViewModel() {

    val guides: StateFlow<List<CultureGuideEntity>> = repository.guides.stateIn(
        viewModelScope, SharingStarted.WhileSubsubscribed(5000), repository.initialGuides
    )

    val sampleQuiz = repository.sampleQuiz

    init {
        viewModelScope.launch {
            repository.initDefaultGuidesIfEmpty()
        }
    }

    fun submitQuizScore(guideId: String, score: Int) {
        viewModelScope.launch {
            repository.updateProgress(guideId, score)
        }
    }
}
