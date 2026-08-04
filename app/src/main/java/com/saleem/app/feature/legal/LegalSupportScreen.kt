package com.saleem.app.feature.legal

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.saleem.app.core.ui.components.SaleemHeader
import com.saleem.app.core.ui.components.StatusBadge

@Composable
fun LegalSupportScreen(
    viewModel: LegalViewModel
) {
    var selectedTab by remember { mutableStateOf(0) } // 0 = Rights, 1 = Procedures, 2 = Document Checklist, 3 = Hotlines
    val checklist by viewModel.docChecklist.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        SaleemHeader(
            title = "Legal Support & Refugee Rights",
            subtitle = "Know your rights, legal procedures, document checklists & hotlines"
        )

        ScrollableTabRow(selectedTabIndex = selectedTab, modifier = Modifier.fillMaxWidth()) {
            Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                Text("Refugee Rights", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                Text("Procedures", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }) {
                Text("Checklist", modifier = Modifier.padding(12.dp))
            }
            Tab(selected = selectedTab == 3, onClick = { selectedTab = 3 }) {
                Text("Emergency Hotlines", modifier = Modifier.padding(12.dp))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        when (selectedTab) {
            0 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(viewModel.rights) { right ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                StatusBadge(text = right.scope)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(right.name, style = MaterialTheme.typography.titleLarge)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(right.description, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
            1 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(viewModel.procedures) { proc ->
                        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(proc.title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("Timeline: ${proc.timeline}", style = MaterialTheme.typography.bodySmall)
                                    Text("Cost: ${proc.cost}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("Required Documents:", style = MaterialTheme.typography.labelLarge)
                                proc.requiredDocs.forEach { doc ->
                                    Text("• $doc", style = MaterialTheme.typography.bodyMedium)
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("Step-by-Step Guide:", style = MaterialTheme.typography.labelLarge)
                                proc.steps.forEachIndexed { i, step ->
                                    Text("${i + 1}. $step", style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
            }
            2 -> {
                Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Residency Application Document Checklist", style = MaterialTheme.typography.titleLarge)
                        Spacer(modifier = Modifier.height(12.dp))

                        checklist.forEachIndexed { index, (item, isChecked) ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                            ) {
                                Checkbox(
                                    checked = isChecked,
                                    onCheckedChange = { viewModel.toggleChecklistItem(index) }
                                )
                                Text(item, style = MaterialTheme.typography.bodyLarge)
                            }
                        }
                    }
                }
            }
            3 -> {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(viewModel.hotlines) { hotline ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(hotline, style = MaterialTheme.typography.titleMedium)
                                Icon(Icons.Default.Phone, contentDescription = "Call", tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }
    }
}
