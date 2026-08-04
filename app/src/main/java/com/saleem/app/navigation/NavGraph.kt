package com.saleem.app.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.saleem.app.feature.assistant.AIAssistantViewModel
import com.saleem.app.feature.assistant.AssistantScreen
import com.saleem.app.feature.auth.AuthViewModel
import com.saleem.app.feature.auth.LoginScreen
import com.saleem.app.feature.auth.NationalityOnboardingScreen
import com.saleem.app.feature.auth.RegisterScreen
import com.saleem.app.feature.awareness.AwarenessScreen
import com.saleem.app.feature.awareness.AwarenessViewModel
import com.saleem.app.feature.community.CommunityScreen
import com.saleem.app.feature.community.CommunityViewModel
import com.saleem.app.feature.culture.CultureGuideScreen
import com.saleem.app.feature.culture.CultureViewModel
import com.saleem.app.feature.learning.LearningHubScreen
import com.saleem.app.feature.learning.LearningViewModel
import com.saleem.app.feature.legal.LegalSupportScreen
import com.saleem.app.feature.legal.LegalViewModel
import com.saleem.app.feature.profile.ProfileScreen
import com.saleem.app.feature.profile.ProfileViewModel
import com.saleem.app.feature.services.ServicesScreen
import com.saleem.app.feature.services.ServicesViewModel
import com.saleem.app.feature.translator.TranslatorScreen
import com.saleem.app.feature.translator.TranslatorViewModel

sealed class Screen(val route: String, val title: String, val icon: ImageVector? = null) {
    object Onboarding : Screen("onboarding", "Onboarding")
    object Login : Screen("login", "Login")
    object Register : Screen("register", "Register")
    object Translator : Screen("translator", "Translate", Icons.Default.GTranslate)
    object Assistant : Screen("assistant", "AI Guide", Icons.Default.Chat)
    object Services : Screen("services", "Services", Icons.Default.Place)
    object Culture : Screen("culture", "Culture", Icons.Default.MenuBook)
    object Legal : Screen("legal", "Legal", Icons.Default.Gavel)
    object Community : Screen("community", "Community", Icons.Default.People)
    object Learning : Screen("learning", "Learning", Icons.Default.School)
    object Awareness : Screen("awareness", "Awareness", Icons.Default.Campaign)
    object Profile : Screen("profile", "Profile", Icons.Default.Person)
}

val bottomNavItems = listOf(
    Screen.Translator,
    Screen.Assistant,
    Screen.Services,
    Screen.Culture,
    Screen.Legal,
    Screen.Community,
    Screen.Learning,
    Screen.Profile
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SaleemNavGraph() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            if (currentRoute != Screen.Onboarding.route && currentRoute != Screen.Login.route && currentRoute != Screen.Register.route) {
                NavigationBar {
                    bottomNavItems.forEach { screen ->
                        NavigationBarItem(
                            icon = { Icon(screen.icon!!, contentDescription = screen.title) },
                            label = { Text(screen.title) },
                            selected = currentRoute == screen.route,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Onboarding.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Onboarding.route) {
                NationalityOnboardingScreen(
                    onNationalitySelected = { nationality, language ->
                        navController.navigate(Screen.Login.route)
                    }
                )
            }
            composable(Screen.Login.route) {
                val authViewModel: AuthViewModel = hiltViewModel()
                LoginScreen(
                    onLoginSuccess = { navController.navigate(Screen.Translator.route) },
                    onNavigateToRegister = { navController.navigate(Screen.Register.route) },
                    viewModel = authViewModel
                )
            }
            composable(Screen.Register.route) {
                val authViewModel: AuthViewModel = hiltViewModel()
                RegisterScreen(
                    onRegisterSuccess = { navController.navigate(Screen.Translator.route) },
                    onNavigateToLogin = { navController.navigate(Screen.Login.route) },
                    viewModel = authViewModel
                )
            }
            composable(Screen.Translator.route) {
                val viewModel: TranslatorViewModel = hiltViewModel()
                TranslatorScreen(viewModel = viewModel)
            }
            composable(Screen.Assistant.route) {
                val viewModel: AIAssistantViewModel = hiltViewModel()
                AssistantScreen(viewModel = viewModel)
            }
            composable(Screen.Services.route) {
                val viewModel: ServicesViewModel = hiltViewModel()
                ServicesScreen(viewModel = viewModel)
            }
            composable(Screen.Culture.route) {
                val viewModel: CultureViewModel = hiltViewModel()
                CultureGuideScreen(viewModel = viewModel)
            }
            composable(Screen.Legal.route) {
                val viewModel: LegalViewModel = hiltViewModel()
                LegalSupportScreen(viewModel = viewModel)
            }
            composable(Screen.Community.route) {
                val viewModel: CommunityViewModel = hiltViewModel()
                CommunityScreen(viewModel = viewModel)
            }
            composable(Screen.Learning.route) {
                val viewModel: LearningViewModel = hiltViewModel()
                LearningHubScreen(viewModel = viewModel)
            }
            composable(Screen.Awareness.route) {
                val viewModel: AwarenessViewModel = hiltViewModel()
                AwarenessScreen(viewModel = viewModel)
            }
            composable(Screen.Profile.route) {
                val viewModel: ProfileViewModel = hiltViewModel()
                ProfileScreen(
                    onLogout = { navController.navigate(Screen.Login.route) },
                    viewModel = viewModel
                )
            }
        }
    }
}
