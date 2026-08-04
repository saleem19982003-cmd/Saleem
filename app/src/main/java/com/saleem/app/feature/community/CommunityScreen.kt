package com.saleem.app.feature.community

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.saleem.app.core.ui.components.SaleemHeader
import com.saleem.app.core.ui.components.StatusBadge

@Composable
fun CommunityScreen(
    viewModel: CommunityViewModel
) {
    var selectedTab by remember { mutableStateOf(0) } // 0 = Q&A Forum, 1 = Volunteers, 2 = Events & Groups
    val questions by viewModel.questions.collectAsState()
    var showAskDialog by remember { mutableStateOf(false) }

    var newTitle by remember { mutableStateOf("") }
    var newDesc by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        SaleemHeader(
            title = "Community Hub & Volunteers",
            subtitle = "Connect with peer mentors, ask community questions & join local meetups"
        )

        TabRow(selectedTabIndex = selectedTab, modifier = Modifier.fillMaxWidth()) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                Text("Q&A Forum", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                Text("Verified Volunteers", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }) {
                Text("Events & Meetups", modifier = Modifier.padding(12.dp))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (selectedTab) {
            0 -> {
                Button(
                    onClick = { showAskDialog = true },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Ask Question to Community")
                }

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(questions) { q ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    StatusBadge(text = q.category)
                                    Text("Asked by ${q.authorName}", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(q.title, style = MaterialTheme.typography.titleLarge)
                                Text(q.description, style = MaterialTheme.typography.bodyMedium)
                                Spacer(modifier = Modifier.height(12.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("💬 ${q.answerCount} Answers", style = MaterialTheme.typography.bodySmall)
                                    IconButton(onClick = { viewModel.upvote(q.id) }) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.ThumbUp, contentDescription = "Upvote", tint = MaterialTheme.colorScheme.primary)
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text("${q.upvotes}")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            1 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(viewModel.volunteers) { v ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(v.name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                                    StatusBadge(text = "Rating ${v.rating}★")
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("Languages: ${v.languages.joinToString(", ")}", style = MaterialTheme.typography.bodyMedium)
                                Text("Specializations: ${v.specializations.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                                    Text("Request Mentorship & Assistance")
                                }
                            }
                        }
                    }
                }
            }
            2 -> {
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Cultural Exchange & Language Meetup", style = MaterialTheme.typography.titleLarge)
                        Text("Date: Saturday, August 15 @ 4:00 PM", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        Text("Location: Al-Azhar Park Cultural Center", style = MaterialTheme.typography.bodyMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Join 45+ refugees and Egyptian youth for open language exchange, coffee, and community networking.", style = MaterialTheme.typography.bodySmall)
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                            Text("RSVP & Confirm Attendance")
                        }
                    }
                }
            }
        }
    }

    if (showAskDialog) {
        AlertDialog(
            onDismissRequest = { showAskDialog = false },
            title = { Text("Ask a Question") },
            text = {
                Column {
                    OutlinedTextField(
                        value = newTitle,
                        onValueChange = { newTitle = it },
                        label = { Text("Question Title") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = newDesc,
                        onValueChange = { newDesc = it },
                        label = { Text("Details / Context") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.askQuestion(newTitle, newDesc, "General")
                        showAskDialog = false
                        newTitle = ""
                        newDesc = ""
                    }
                ) {
                    Text("Post Question")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAskDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}
