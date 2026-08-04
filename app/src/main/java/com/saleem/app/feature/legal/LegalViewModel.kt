package com.saleem.app.feature.legal

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

@HiltViewModel
class LegalViewModel @Inject constructor(
    private val repository: LegalRepository
) : ViewModel() {

    val rights = repository.rightsList
    val procedures = repository.procedures
    val hotlines = repository.emergencyHotlines

    var docChecklist = MutableStateFlow(
        listOf(
            "Valid Passport" to true,
            "UNHCR Card Copy" to true,
            "Rental Lease Agreement" to false,
            "Proof of Address / Utility Bill" to false,
            "Recent Passport Photos (4x)" to true
        )
    )

    fun toggleChecklistItem(index: Int) {
        val current = docChecklist.value.toMutableList()
        val item = current[index]
        current[index] = item.first to !item.second
        docChecklist.value = current
    }
}
