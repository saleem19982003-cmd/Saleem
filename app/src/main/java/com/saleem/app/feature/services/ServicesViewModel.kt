package com.saleem.app.feature.services

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.saleem.app.core.data.local.entity.ServiceEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ServicesViewModel @Inject constructor(
    private val repository: ServicesRepository
) : ViewModel() {

    var selectedCategory = MutableStateFlow("All")

    val services: StateFlow<List<ServiceEntity>> = selectedCategory
        .flatMapLatest { cat -> repository.getServices(cat) }
        .stateIn(viewModelScope, SharingStarted.WhileSubsubscribed(5000), repository.initialServices)

    init {
        viewModelScope.launch {
            repository.seedInitialServices()
        }
    }

    fun setCategory(category: String) {
        selectedCategory.value = category
    }

    fun toggleBookmark(service: ServiceEntity) {
        viewModelScope.launch {
            repository.toggleBookmark(service.id, service.isBookmarked)
        }
    }
}
