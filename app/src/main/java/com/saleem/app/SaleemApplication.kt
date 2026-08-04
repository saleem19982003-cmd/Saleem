package com.saleem.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class SaleemApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize global app services, crashlytics, etc.
    }
}
