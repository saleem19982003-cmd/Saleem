package com.saleem.app.feature.assistant

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AIAssistantViewModel @Inject constructor(
    private val repository: AssistantRepository
) : ViewModel() {

    private val _messages = MutableStateFlow<List<ChatMessage>>(
        listOf(
            ChatMessage(
                sender = "assistant",
                text = "Ahlan! I am your AI cultural & legal guide in Egypt. Ask me anything in English, Arabic, Amharic, Somali, French, or Tigrinya!"
            )
        )
    )
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _isTyping = MutableStateFlow(false)
    val isTyping: StateFlow<Boolean> = _isTyping.asStateFlow()

    val quickQuestions = repository.quickQuestions

    fun sendMessage(text: String) {
        if (text.isBlank()) return
        val userMsg = ChatMessage(sender = "user", text = text)
        _messages.value = _messages.value + userMsg

        viewModelScope.launch {
            _isTyping.value = true
            val aiMsg = repository.getResponse(text)
            _isTyping.value = false
            _messages.value = _messages.value + aiMsg
        }
    }
}
