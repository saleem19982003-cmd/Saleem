package com.saleem.app.feature.translator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.saleem.app.core.ui.components.AudioWaveformAnimation
import com.saleem.app.core.ui.components.SaleemHeader

@Composable
fun TranslatorScreen(
    viewModel: TranslatorViewModel
) {
    var inputText by remember { mutableStateOf("") }
    var isRecording by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableStateOf(0) } // 0 = Translator, 1 = African Dictionary, 2 = History

    val currentTranslation by viewModel.currentTranslation.collectAsState()
    val history by viewModel.history.collectAsState()
    val srcLang by viewModel.sourceLanguage.collectAsState()
    val tgtLang by viewModel.targetLanguage.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        SaleemHeader(
            title = "African & Egyptian Dialect Translator",
            subtitle = "Translate text & multi-accent speech across all African languages"
        )

        TabRow(selectedTabIndex = selectedTab, modifier = Modifier.fillMaxWidth()) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                Text("Translator", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                Text("African Dictionary", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }) {
                Text("History (${history.size})", modifier = Modifier.padding(12.dp))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (selectedTab) {
            0 -> {
                // Language Selection Bar
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("From: $srcLang", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        Icon(Icons.Default.CompareArrows, contentDescription = "Swap", tint = Color.Gray)
                        Text("To: $tgtLang", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    label = { Text("Type or speak in any African language...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    trailingIcon = {
                        if (inputText.isNotEmpty()) {
                            IconButton(onClick = { inputText = "" }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear")
                            }
                        }
                    }
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { isRecording = !isRecording },
                        colors = IconButtonDefaults.iconButtonColors(
                            containerColor = if (isRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primaryContainer
                        )
                    ) {
                        Icon(
                            imageVector = if (isRecording) Icons.Default.Stop else Icons.Default.Mic,
                            contentDescription = "Voice Accent Recognition",
                            tint = if (isRecording) Color.White else MaterialTheme.colorScheme.primary
                        )
                    }

                    Button(
                        onClick = { viewModel.translate(inputText) },
                        modifier = Modifier.height(48.dp)
                    ) {
                        Icon(Icons.Default.Translate, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Translate Now")
                    }
                }

                if (isRecording) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("Listening to multi-accent speech...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                    AudioWaveformAnimation(isRecording = true)
                }

                currentTranslation?.let { result ->
                    Spacer(modifier = Modifier.height(20.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = result.targetLang,
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                IconButton(onClick = { viewModel.toggleFavorite(result) }) {
                                    Icon(
                                        imageVector = if (result.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                        contentDescription = "Favorite",
                                        tint = if (result.isFavorite) Color.Red else Color.Gray
                                    )
                                }
                            }
                            Text(
                                text = result.targetText,
                                style = MaterialTheme.typography.titleLarge
                            )
                        }
                    }
                }
            }
            1 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(viewModel.slangEntries) { slang ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                    Text(slang.word, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                                    Text(slang.dialect, style = MaterialTheme.typography.labelMedium)
                                }
                                Text(slang.translation, style = MaterialTheme.typography.bodyLarge)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("Context: ${slang.context}", style = MaterialTheme.typography.bodyMedium, color = Color.Gray)
                                Text("Example: \"${slang.example}\"", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                            }
                        }
                    }
                }
            }
            2 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(history) { item ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(item.sourceText, style = MaterialTheme.typography.bodyMedium)
                                Text("➔ ${item.targetText}", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }
    }
}
