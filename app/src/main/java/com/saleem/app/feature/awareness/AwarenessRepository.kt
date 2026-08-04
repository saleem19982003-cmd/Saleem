package com.saleem.app.feature.awareness

import javax.inject.Inject
import javax.inject.Singleton

data class Campaign(
    val title: String,
    val category: String,
    val description: String,
    val sharesCount: Int
)

data class IncidentReport(
    val id: String,
    val category: String,
    val location: String,
    val description: String,
    val status: String = "Under Review",
    val timestamp: Long = System.currentTimeMillis()
)

@Singleton
class AwarenessRepository @Inject constructor() {

    val campaigns = listOf(
        Campaign(
            title = "#StandTogether: Celebrating African Diversity in Egypt",
            category = "Cultural Inclusion",
            description = "Community initiative promoting mutual understanding, joint cultural festivals, and anti-discrimination pledges.",
            sharesCount = 1420
        ),
        Campaign(
            title = "Equal Workplace Rights & Fair Pay Initiative",
            category = "Economic Rights",
            description = "Advocating for fair contracts, dignity, and anti-harassment safeguards for displaced workers.",
            sharesCount = 890
        )
    )

    private val userReports = mutableListOf<IncidentReport>()

    fun submitReport(category: String, location: String, details: String): IncidentReport {
        val report = IncidentReport(
            id = "rep_" + System.currentTimeMillis(),
            category = category,
            location = location,
            description = details
        )
        userReports.add(report)
        return report
    }

    fun getReports(): List<IncidentReport> = userReports.toList()
}
