package com.saleem.app.feature.services

import com.saleem.app.core.data.local.dao.ServiceDao
import com.saleem.app.core.data.local.entity.ServiceEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ServicesRepository @Inject constructor(
    private val serviceDao: ServiceDao
) {
    val initialServices = listOf(
        ServiceEntity(
            id = "s_1",
            name = "UNHCR Greater Cairo Main Office",
            category = "Government & NGOs",
            address = "56 Central Spine, 6th of October City, Giza",
            phone = "02 2728 4300",
            latitude = 29.9723,
            longitude = 30.9412,
            rating = 4.8f
        ),
        ServiceEntity(
            id = "s_2",
            name = "Egyptian Red Crescent Primary Health Clinic",
            category = "Healthcare",
            address = "Zahraa El Maadi, Cairo",
            phone = "02 2519 2831",
            latitude = 29.9654,
            longitude = 31.2845,
            rating = 4.6f
        ),
        ServiceEntity(
            id = "s_3",
            name = "Refuge Egypt Vocational Training & Language Center",
            category = "Education",
            address = "All Saints' Cathedral, Zamalek, Cairo",
            phone = "02 2738 0824",
            latitude = 30.0589,
            longitude = 31.2234,
            rating = 4.9f
        ),
        ServiceEntity(
            id = "s_4",
            name = "St. Andrew's Refugee Services (StARS)",
            category = "Support & Legal Aid",
            address = "38 26th of July St, Downtown, Cairo",
            phone = "02 2575 9451",
            latitude = 30.0512,
            longitude = 31.2401,
            rating = 4.7f
        )
    )

    fun getServices(category: String): Flow<List<ServiceEntity>> {
        return serviceDao.getServicesByCategory(category)
    }

    suspend fun seedInitialServices() {
        serviceDao.insertServices(initialServices)
    }

    suspend fun toggleBookmark(id: String, currentStatus: Boolean) {
        serviceDao.updateBookmark(id, !currentStatus)
    }
}
