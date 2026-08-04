package com.saleem.app.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.saleem.app.core.ui.components.SaleemHeader

@Composable
fun RegisterScreen(
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit,
    viewModel: AuthViewModel
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var nationality by remember { mutableStateOf("Sudan") }
    var language by remember { mutableStateOf("Arabic (Egyptian / Sudanese)") }

    // Automatic Language Adaptation based on Country Selection
    LaunchedEffect(nationality) {
        language = when (nationality) {
            "Ethiopia" -> "Amharic (አማርኛ)"
            "Somalia" -> "Somali (Soomaali)"
            "Eritrea" -> "Tigrinya (ትግርኛ)"
            "Kenya", "Tanzania" -> "Swahili (Kiswahili)"
            "Nigeria" -> "Hausa"
            "DR Congo" -> "French (Français)"
            "Syria", "Sudan", "Egypt" -> "Arabic (Egyptian / Sudanese)"
            else -> "English"
        }
    }

    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Success) {
            onRegisterSuccess()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        SaleemHeader(
            title = "Join Saleem",
            subtitle = "Select your country of origin to automatically personalize language, cultural & legal tools."
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("Full Name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email Address") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("Phone Number (+20 format)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = nationality,
            onValueChange = { nationality = it },
            label = { Text("Country of Origin (e.g. Sudan, Ethiopia, Somalia, Eritrea, Kenya)") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "✨ Preferred App Language Auto-set to: $language",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(20.dp))

        Button(
            onClick = { viewModel.register(name, email, phone, nationality, language) },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
        ) {
            Text("Create Account & Auto-Configure App")
        }

        Spacer(modifier = Modifier.height(12.dp))

        TextButton(onClick = onNavigateToLogin) {
            Text("Already registered? Login")
        }
    }
}
