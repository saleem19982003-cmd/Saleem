package com.saleem.app.feature.community

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.saleem.app.core.data.local.entity.QuestionEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CommunityViewModel @Inject constructor(
    private val repository: CommunityRepository
) : ViewModel() {

    val questions: StateFlow<List<QuestionEntity>> = repository.questions.stateIn(
        viewModelScope, SharingStarted.WhileSubsubscribed(5000), repository.initialQuestions
    )

    val volunteers = repository.volunteers

    init {
        viewModelScope.launch {
            repository.seedInitialQuestions()
        }
    }

    fun askQuestion(title: String, desc: String, category: String) {
        viewModelScope.launch {
            repository.askQuestion(title, desc, category)
        }
    }

    fun upvote(id: String) {
        viewModelScope.launch {
            repository.upvote(id)
        }
    }
}
