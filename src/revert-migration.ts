import 'reflect-metadata';
import { AppDataSource } from './config/data-source';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function revertLastMigration() {
    try {
        console.log('🔧 Initializing database connection...');
        await AppDataSource.initialize();
        console.log('✅ Database connected successfully');
        
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        
        // Получаем последнюю примененную миграцию
        const lastMigration = await queryRunner.query(
            'SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 1'
        );
        
        if (lastMigration.length === 0) {
            console.log('❌ No migrations to revert');
            await queryRunner.release();
            await AppDataSource.destroy();
            return;
        }
        
        const migrationName = lastMigration[0].name;
        console.log(`⏳ Reverting migration: ${migrationName}`);
        
        // Находим файл миграции
        const migrationsDir = path.join(__dirname, '../migrations');
        const migrationFile = `${migrationName}.ts`;
        const migrationPath = path.join(migrationsDir, migrationFile);
        
        if (!fs.existsSync(migrationPath)) {
            console.error(`❌ Migration file not found: ${migrationFile}`);
            await queryRunner.release();
            await AppDataSource.destroy();
            return;
        }
        
        // Импортируем и выполняем down миграцию
        const migrationModule = require(migrationPath);
        const MigrationClass = migrationModule[migrationName] || 
                               migrationModule.default || 
                               Object.values(migrationModule)[0];
        
        if (MigrationClass) {
            const migration = new MigrationClass();
            await migration.down(queryRunner);
            
            // Удаляем запись о миграции
            await queryRunner.query(
                'DELETE FROM migrations WHERE name = $1',
                [migrationName]
            );
            
            console.log(`✅ Reverted: ${migrationName}`);
        }
        
        await queryRunner.release();
        await AppDataSource.destroy();
        
        console.log('🔌 Database connection closed');
        
    } catch (error) {
        console.error('❌ Revert failed:', error);
        process.exit(1);
    }
}

revertLastMigration();