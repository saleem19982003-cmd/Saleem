package com.saleem.app.feature.awareness

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class AwarenessViewModel @Inject constructor(
    private val repository: AwarenessRepository
) : ViewModel() {

    val campaigns = repository.campaigns

    private val _reports = MutableStateFlow<List<IncidentReport>>(emptyList())
    val reports: StateFlow<List<IncidentReport>> = _reports

    fun submitReport(category: String, location: String, details: String) {
        val newReport = repository.submitReport(category, location, details)
        _reports.value = _reports.value + newReport
    }
}
