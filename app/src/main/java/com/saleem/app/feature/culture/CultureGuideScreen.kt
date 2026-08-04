package com.saleem.app.feature.culture

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.saleem.app.core.ui.components.SaleemHeader
import com.saleem.app.core.ui.components.StatusBadge

@Composable
fun CultureGuideScreen(
    viewModel: CultureViewModel
) {
    val guides by viewModel.guides.collectAsState()
    var selectedGuide by remember { mutableStateOf<CultureGuideEntity?>(null) }
    var inQuizMode by remember { mutableStateOf(false) }
    var selectedOption by remember { mutableStateOf(-1) }
    var score by remember { mutableStateOf(0) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        SaleemHeader(
            title = "Interactive Culture Guide",
            subtitle = "Master Egyptian customs, etiquette, lifestyle & earn completion certificates"
        )

        if (selectedGuide == null) {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(guides) { guide ->
                    Card(
                        onClick = { selectedGuide = guide },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                StatusBadge(text = guide.category)
                                if (guide.completed) {
                                    StatusBadge(text = "Completed (${guide.quizScore}%)", backgroundColor = Color(0xFF10B981))
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(guide.title, style = MaterialTheme.typography.titleLarge)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(guide.description, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        } else if (!inQuizMode) {
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text(selectedGuide!!.title, style = MaterialTheme.typography.headlineMedium)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(selectedGuide!!.content, style = MaterialTheme.typography.bodyLarge)
                    Spacer(modifier = Modifier.height(24.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        OutlinedButton(onClick = { selectedGuide = null }) {
                            Text("Back to Guides")
                        }
                        Button(onClick = { inQuizMode = true }) {
                            Text("Take Quiz")
                        }
                    }
                }
            }
        } else {
            val q = viewModel.sampleQuiz[0]
            Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text("Interactive Knowledge Check", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(q.question, style = MaterialTheme.typography.titleLarge)
                    Spacer(modifier = Modifier.height(16.dp))

                    q.options.forEachIndexed { index, option ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                        ) {
                            RadioButton(
                                selected = selectedOption == index,
                                onClick = { selectedOption = index }
                            )
                            Text(option, style = MaterialTheme.typography.bodyLarge)
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Button(
                        onClick = {
                            val isCorrect = selectedOption == q.correctAnswerIndex
                            val finalScore = if (isCorrect) 100 else 50
                            viewModel.submitQuizScore(selectedGuide!!.id, finalScore)
                            inQuizMode = false
                            selectedGuide = null
                            selectedOption = -1
                        },
                        enabled = selectedOption != -1,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Submit Answer")
                    }
                }
            }
        }
    }
}
