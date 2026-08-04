package com.saleem.app.feature.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.saleem.app.core.data.local.entity.UserEntity
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: ProfileRepository
) : ViewModel() {

    val user: StateFlow<UserEntity?> = repository.activeUser.stateIn(
        viewModelScope, SharingStarted.WhileSubsubscribed(5000), null
    )

    fun updateProfile(name: String, language: String, nationality: String) {
        viewModelScope.launch {
            repository.updateProfile(name, language, nationality)
        }
    }
}
