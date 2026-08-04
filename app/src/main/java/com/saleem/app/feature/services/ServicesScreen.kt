package com.saleem.app.feature.services

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
import com.saleem.app.core.ui.components.SaleemHeader
import com.saleem.app.core.ui.components.StatusBadge

@Composable
fun ServicesScreen(
    viewModel: ServicesViewModel
) {
    val services by viewModel.services.collectAsState()
    val activeCategory by viewModel.selectedCategory.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var isMapView by remember { mutableStateOf(false) }

    val categories = listOf("All", "Healthcare", "Education", "Government & NGOs", "Support & Legal Aid")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        SaleemHeader(
            title = "Essential Services Directory",
            subtitle = "Find nearby hospitals, legal aid centers, language schools & NGO offices"
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search services...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                modifier = Modifier.weight(1f),
                singleLine = true
            )
            Spacer(modifier = Modifier.width(8.dp))
            IconButton(
                onClick = { isMapView = !isMapView },
                colors = IconButtonDefaults.iconButtonColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Icon(
                    imageVector = if (isMapView) Icons.Default.List else Icons.Default.Map,
                    contentDescription = "Toggle View",
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(categories) { cat ->
                FilterChip(
                    selected = activeCategory == cat,
                    onClick = { viewModel.setCategory(cat) },
                    label = { Text(cat) }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (!isMapView) {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val filtered = services.filter {
                    it.name.contains(searchQuery, ignoreCase = true) || it.address.contains(searchQuery, ignoreCase = true)
                }
                items(filtered) { s ->
                    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                StatusBadge(text = s.category)
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFE8AB63), modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("${s.rating}", style = MaterialTheme.typography.labelLarge)
                                }
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(s.name, style = MaterialTheme.typography.titleLarge)
                            Text(s.address, style = MaterialTheme.typography.bodyMedium, color = Color.Gray)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("📞 ${s.phone}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                                IconButton(onClick = { viewModel.toggleBookmark(s) }) {
                                    Icon(
                                        imageVector = if (s.isBookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                                        contentDescription = "Bookmark",
                                        tint = if (s.isBookmarked) MaterialTheme.colorScheme.primary else Color.Gray
                                    )
                                }
                            }
                        }
                    }
                }
            }
        } else {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(16.dp)
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Map, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Interactive Map View Active", style = MaterialTheme.typography.titleMedium)
                        Text("Showing ${services.size} service markers across Greater Cairo", style = MaterialTheme.typography.bodyMedium, color = Color.Gray)
                    }
                }
            }
        }
    }
}
