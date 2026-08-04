package com.saleem.app.feature.legal

import javax.inject.Inject
import javax.inject.Singleton

data class LegalProcedure(
    val title: String,
    val timeline: String,
    val cost: String,
    val requiredDocs: List<String>,
    val steps: List<String>
)

data class LegalRight(
    val name: String,
    val description: String,
    val scope: String
)

@Singleton
class LegalRepository @Inject constructor() {

    val rightsList = listOf(
        LegalRight(
            name = "Right to Freedom of Movement",
            description = "Registered asylum seekers and refugees in Egypt have the legal right to reside and move across governorates.",
            scope = "National Protection under 1951 Convention"
        ),
        LegalRight(
            name = "Access to Public Healthcare & Vaccination",
            description = "Refugees enjoy equal access to primary healthcare clinics, emergency care, and national health initiatives.",
            scope = "Ministry of Health Partnership"
        ),
        LegalRight(
            name = "Right to Education",
            description = "Children of registered refugees have access to public basic education schools subject to ministry regulations.",
            scope = "Ministerial Decree Access"
        )
    )

    val procedures = listOf(
        LegalProcedure(
            title = "UNHCR Yellow Card Registration & Renewal",
            timeline = "2 - 4 Weeks",
            cost = "Free of Charge",
            requiredDocs = listOf("Passport or official ID", "Proof of address", "4 Passport photos"),
            steps = listOf(
                "Book appointment at UNHCR Registration Unit (6th of October / Zamalek).",
                "Attend identity verification and biometrics capture interview.",
                "Receive registered Yellow Card for legal stay protection."
            )
        ),
        LegalProcedure(
            title = "Residency Permit Stamping (Passports Administration)",
            timeline = "1 - 2 Weeks",
            cost = "Standard Administrative Fee",
            requiredDocs = listOf("Valid Yellow Card", "Passport", "Application form"),
            steps = listOf(
                "Submit Yellow Card at Passports, Immigration & Nationality Administration.",
                "Pay standard processing fee and obtain reference receipt.",
                "Return to collect stamped residency permit in passport."
            )
        )
    )

    val emergencyHotlines = listOf(
        "UNHCR Legal Helpline: 02 2728 4300",
        "Egyptian Red Crescent Emergency: 19963",
        "Ambulance Service: 123",
        "Police Emergency: 122"
    )
}
