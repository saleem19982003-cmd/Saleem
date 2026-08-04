package com.saleem.app.feature.awareness

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
fun AwarenessScreen(
    viewModel: AwarenessViewModel
) {
    var selectedTab by remember { mutableStateOf(0) } // 0 = Campaigns, 1 = Report Incident, 2 = My Reports
    val reports by viewModel.reports.collectAsState()

    var category by remember { mutableStateOf("Workplace Discrimination") }
    var location by remember { mutableStateOf("") }
    var details by remember { mutableStateOf("") }
    var reportSubmitted by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        SaleemHeader(
            title = "Awareness & Inclusion",
            subtitle = "Promoting anti-discrimination, reporting incidents securely & sharing success stories"
        )

        TabRow(selectedTabIndex = selectedTab, modifier = Modifier.fillMaxWidth()) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                Text("Campaigns", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                Text("Report Incident", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }) {
                Text("My Reports (${reports.size})", modifier = Modifier.padding(12.dp))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (selectedTab) {
            0 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(viewModel.campaigns) { cmp ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                StatusBadge(text = cmp.category)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(cmp.title, style = MaterialTheme.typography.titleLarge)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(cmp.description, style = MaterialTheme.typography.bodyMedium)
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                                    Text("Share Campaign (${cmp.sharesCount} Shares)")
                                }
                            }
                        }
                    }
                }
            }
            1 -> {
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Confidential Discrimination Incident Report", style = MaterialTheme.typography.titleLarge)
                        Text("All reports can be submitted anonymously and are forwarded to legal aid partners.", style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                        Spacer(modifier = Modifier.height(12.dp))

                        OutlinedTextField(
                            value = category,
                            onValueChange = { category = it },
                            label = { Text("Incident Category") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = location,
                            onValueChange = { location = it },
                            label = { Text("Location / District") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = details,
                            onValueChange = { details = it },
                            label = { Text("Detailed Description of Incident") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(100.dp)
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = {
                                viewModel.submitReport(category, location, details)
                                reportSubmitted = true
                                details = ""
                                location = ""
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Submit Confidential Report")
                        }

                        if (reportSubmitted) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("✓ Report submitted successfully. Tracking code assigned.", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
            2 -> {
                if (reports.isEmpty()) {
                    Text("No reports filed yet.", color = Color.Gray, modifier = Modifier.padding(16.dp))
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(reports) { r ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                        Text(r.category, style = MaterialTheme.typography.titleMedium)
                                        StatusBadge(text = r.status)
                                    }
                                    Text("Location: ${r.location}", style = MaterialTheme.typography.bodyMedium)
                                    Text(r.description, style = MaterialTheme.typography.bodySmall, color = Color.Gray)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
