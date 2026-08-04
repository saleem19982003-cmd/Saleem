package com.saleem.app.feature.learning

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.saleem.app.core.ui.components.SaleemHeader
import com.saleem.app.core.ui.components.StatusBadge

@Composable
fun LearningHubScreen(
    viewModel: LearningViewModel
) {
    val courses by viewModel.courses.collectAsState()
    var selectedTab by remember { mutableStateOf(0) } // 0 = Courses, 1 = Career Paths, 2 = Tech Job Board

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        SaleemHeader(
            title = "Learning Hub & Job Board",
            subtitle = "Free programming education, tech skill certificates & remote job opportunities"
        )

        TabRow(selectedTabIndex = selectedTab, modifier = Modifier.fillMaxWidth()) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                Text("Courses", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                Text("Career Paths", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }) {
                Text("Job Board", modifier = Modifier.padding(12.dp))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (selectedTab) {
            0 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(courses) { course ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    StatusBadge(text = course.category)
                                    StatusBadge(text = course.level, backgroundColor = MaterialTheme.colorScheme.secondary)
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(course.title, style = MaterialTheme.typography.titleLarge)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(course.description, style = MaterialTheme.typography.bodyMedium)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("Duration: ${course.durationMinutes / 60} Hours", style = MaterialTheme.typography.labelMedium, color = Color.Gray)
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(
                                    onClick = { viewModel.enroll(course.id) },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text("Enroll & Start Free Course")
                                }
                            }
                        }
                    }
                }
            }
            1 -> {
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Junior Frontend Developer Path", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Recommended Sequence: HTML/CSS ➔ JavaScript ➔ React Basics", style = MaterialTheme.typography.bodyMedium)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Estimated Completion: 8 Weeks (10 hrs/week)", style = MaterialTheme.typography.labelLarge)
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                            Text("Start Full Career Path")
                        }
                    }
                }
            }
            2 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                StatusBadge(text = "Remote / Cairo")
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("Junior Web Developer", style = MaterialTheme.typography.titleLarge)
                                Text("Tech For Inclusion NGO • Full Time", style = MaterialTheme.typography.bodyMedium, color = Color.Gray)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("Skills required: HTML, CSS, JavaScript, Git. Open to refugee applicants with portfolio certificate.", style = MaterialTheme.typography.bodySmall)
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                                    Text("Apply With Saleem CV")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
