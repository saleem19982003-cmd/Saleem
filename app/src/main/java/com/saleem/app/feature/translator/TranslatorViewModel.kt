package com.saleem.app.feature.translator

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.saleem.app.core.data.local.entity.TranslationEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class TranslatorViewModel @Inject constructor(
    private val repository: TranslationRepository
) : ViewModel() {

    var sourceLanguage = MutableStateFlow("English")
    var targetLanguage = MutableStateFlow("Arabic (Egyptian / Sudanese)")

    val supportedLanguages = repository.supportedLanguages

    private val _currentTranslation = MutableStateFlow<TranslationEntity?>(null)
    val currentTranslation: StateFlow<TranslationEntity?> = _currentTranslation.asStateFlow()

    val history: StateFlow<List<TranslationEntity>> = repository.history.stateIn(
        viewModelScope, SharingStarted.WhileSubsubscribed(5000), emptyList()
    )

    val slangEntries = repository.slangDictionary

    fun translate(text: String) {
        if (text.isBlank()) return
        viewModelScope.launch {
            val result = repository.translateText(text, sourceLanguage.value, targetLanguage.value)
            _currentTranslation.value = result
        }
    }

    fun toggleFavorite(entity: TranslationEntity) {
        viewModelScope.launch {
            repository.toggleFavorite(entity.id, entity.isFavorite)
        }
    }
}
