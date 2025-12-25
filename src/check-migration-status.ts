import 'reflect-metadata';
import { AppDataSource } from './config/data-source';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkMigrationStatus() {
    try {
        await AppDataSource.initialize();
        console.log('✅ Database connected');
        
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        
        // Проверяем существование таблицы миграций
        const migrationTableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'migrations'
            )
        `);
        
        if (!migrationTableExists[0].exists) {
            console.log('📊 Migration table does not exist yet');
            await queryRunner.release();
            await AppDataSource.destroy();
            return;
        }
        
        // Получаем выполненные миграции
        const executedMigrations = await queryRunner.query(
            'SELECT name, executed_at FROM migrations ORDER BY executed_at'
        );
        
        // Получаем все файлы миграций
        const migrationsDir = path.join(__dirname, '../migrations');
        const migrationFiles = fs.existsSync(migrationsDir) 
            ? fs.readdirSync(migrationsDir)
                .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
                .map(file => file.replace('.ts', '').replace('.js', ''))
                .sort()
            : [];
        
        console.log('\n📊 MIGRATION STATUS');
        console.log('='.repeat(50));
        
        console.log('\n✅ Applied migrations:');
        executedMigrations.forEach((m: any, i: number) => {
            console.log(`  ${i + 1}. ${m.name} (${new Date(m.executed_at).toLocaleString()})`);
        });
        
        console.log('\n📁 Available migration files:');
        migrationFiles.forEach((file, i) => {
            const isApplied = executedMigrations.some((m: any) => m.name === file);
            const status = isApplied ? '✅ Applied' : '⏳ Pending';
            console.log(`  ${i + 1}. ${file} - ${status}`);
        });
        
        const pending = migrationFiles.filter(
            file => !executedMigrations.some((m: any) => m.name === file)
        ).length;
        
        console.log('\n📈 Summary:');
        console.log(`  Total migrations: ${migrationFiles.length}`);
        console.log(`  Applied: ${executedMigrations.length}`);
        console.log(`  Pending: ${pending}`);
        
        await queryRunner.release();
        await AppDataSource.destroy();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

checkMigrationStatus();