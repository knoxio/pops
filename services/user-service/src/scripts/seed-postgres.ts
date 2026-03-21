#!/usr/bin/env tsx

import { createId } from '@paralleldrive/cuid2'
import { PasswordService } from '../auth/password.js'
import { db, users } from '../db/index.js'

console.log('🌱 Seeding PostgreSQL user database...')

async function seedData() {
  try {
    // Clear existing data first
    console.log('🗑️ Clearing existing users...')
    await db.delete(users)

    // Hash default password for test users
    console.log('🔐 Hashing passwords...')
    const defaultPassword = await PasswordService.hashPassword('password123')

    // Test users data
    const userData = [
      {
        id: 'user_test_john_doe',
        name: 'John Doe',
        email: 'john.doe@example.com',
        password: defaultPassword,
        avatar: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_test_jane_smith', 
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        password: defaultPassword,
        avatar: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_test_admin',
        name: 'Admin User',
        email: 'admin@example.com',
        password: defaultPassword,
        avatar: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    // Insert users
    console.log('👥 Creating test users...')
    for (const user of userData) {
      await db.insert(users).values(user)
      console.log(`✅ Created user: ${user.name} (${user.email})`)
    }

    console.log(`🎉 Successfully seeded ${userData.length} users!`)
    console.log('🔑 All users have password: password123')
  } catch (error) {
    console.error('❌ Error seeding user data:', error)
    process.exit(1)
  }
}

// Run the seeding function
seedData()