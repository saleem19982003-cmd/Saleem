package com.saleem.app.feature.assistant

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import javax.inject.Inject
import javax.inject.Singleton

data class ChatMessage(
    val id: String = "msg_" + System.currentTimeMillis(),
    val sender: String, // "user" or "assistant"
    val text: String,
    val timestamp: Long = System.currentTimeMillis()
)

@Singleton
class AssistantRepository @Inject constructor() {

    val quickQuestions = mapOf(
        "Daily Life" to listOf(
            "How do I find an apartment in Cairo?",
            "Where can I buy groceries/necessities?",
            "How do I open a bank account in Egypt?",
            "What is the average cost of living?"
        ),
        "Transportation" to listOf(
            "How do I use the Cairo metro system?",
            "How much do taxis and Uber cost?",
            "Where is the nearest bus station?"
        ),
        "Government Procedures" to listOf(
            "What documents do I need for residency renewal?",
            "How do I apply for a work permit?",
            "Where is the main UNHCR office in Greater Cairo?"
        ),
        "Emergency Services" to listOf(
            "Where is the nearest public hospital?",
            "What is the emergency ambulance number (123)?",
            "Who do I contact for legal aid?"
        )
    )

    suspend fun getResponse(userPrompt: String): ChatMessage = withContext(Dispatchers.IO) {
        val replyText = try {
            val encodedPrompt = URLEncoder.encode("System: You are Saleem AI guide for refugees in Egypt. User: $userPrompt", "UTF-8")
            val url = URL("https://text.pollinations.ai/prompt/$encodedPrompt")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            if (conn.responseCode == 200) {
                conn.inputStream.bufferedReader().use { it.readText() }
            } else {
                throw Exception("HTTP Error ${conn.responseCode}")
            }
        } catch (e: Exception) {
            when {
                userPrompt.contains("apartment", ignoreCase = true) ->
                    "To rent an apartment in Cairo, check popular areas like Nasr City, Maadi, or Faisal. Always request a formal rental agreement (Aqd Igar) and confirm water/electricity meter readings before signing."
                userPrompt.contains("metro", ignoreCase = true) ->
                    "The Cairo Metro has 3 main lines. Single-trip tickets cost 6, 8, 12, or 15 EGP. Dedicated female-only carriages are located in the center of every train."
                userPrompt.contains("bank", ignoreCase = true) ->
                    "To open a bank account in Egypt, bring your valid passport, yellow UNHCR card or residency card, and proof of address. Banque Misr and CIB offer refugee account options."
                userPrompt.contains("residency", ignoreCase = true) ->
                    "Residency procedures require booking an appointment at the Passports, Immigration & Nationality Administration along with 4 passport photos and your UNHCR card."
                else ->
                    "I am Saleem's Multilingual AI Assistant. I can guide you on legal documentation, Egyptian public transit, housing, and social integration. How can I assist you further today?"
            }
        }

        ChatMessage(sender = "assistant", text = replyText)
    }
}
