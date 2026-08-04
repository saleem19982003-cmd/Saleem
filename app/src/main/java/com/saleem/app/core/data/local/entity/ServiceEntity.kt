package com.saleem.app.core.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "services")
data class ServiceEntity(
    @PrimaryKey val id: String,
    val name: String,
    val category: String,
    val address: String,
    val phone: String,
    val latitude: Double,
    val longitude: Double,
    val rating: Float,
    val isBookmarked: Boolean = false
)
