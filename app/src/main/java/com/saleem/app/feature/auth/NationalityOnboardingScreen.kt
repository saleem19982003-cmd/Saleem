package com.saleem.app.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.saleem.app.core.ui.theme.WarmSandSecondary

data class NationItem(
    val name: String,
    val flag: String,
    val defaultLang: String
)

@Composable
fun NationalityOnboardingScreen(
    onNationalitySelected: (String, String, String) -> Unit
) {
    var userName by remember { mutableStateOf("") }

    val nations = listOf(
        NationItem("Sudan", "🇸🇩", "Arabic (Egyptian / Sudanese)"),
        NationItem("Ethiopia", "🇪🇹", "Amharic (አማርኛ)"),
        NationItem("Somalia", "🇸🇴", "Somali (Soomaali)"),
        NationItem("Eritrea", "🇪🇷", "Tigrinya (ትግርኛ)"),
        NationItem("Kenya", "🇰🇪", "Swahili (Kiswahili)"),
        NationItem("Nigeria", "🇳🇬", "Hausa"),
        NationItem("DR Congo", "🇨🇩", "French (Français)"),
        NationItem("Syria", "🇸🇾", "Arabic (العربية)"),
        NationItem("Egypt", "🇪🇬", "Arabic (Egyptian Dialect)"),
        NationItem("Other Nation", "🌐", "English")
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(20.dp))

        Surface(
            color = WarmSandSecondary,
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.size(60.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("👤", fontSize = 30.sp)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Welcome to Saleem",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = "Enter your full name and select your country of origin to personalize your experience.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.Gray,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 16.dp)
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = userName,
            onValueChange = { userName = it },
            label = { Text("Your Full Name") },
            placeholder = { Text("e.g. Amina Hassan") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Select Country of Origin:",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.align(Alignment.Start)
        )

        Spacer(modifier = Modifier.height(8.dp))

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.weight(1f)
        ) {
            items(nations) { nation ->
                OutlinedButton(
                    onClick = {
                        val finalName = if (userName.isBlank()) "Amina Hassan" else userName
                        onNationalitySelected(finalName, nation.name, nation.defaultLang)
                    },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(76.dp)
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = "${nation.flag} ${nation.name}", style = MaterialTheme.typography.titleMedium)
                        Text(text = nation.defaultLang, style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
    }
}
