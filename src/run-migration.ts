import 'reflect-metadata';
import { AppDataSource } from './config/data-source';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function runAllMigrations() {
    try {
        console.log('🔧 Initializing database connection...');
        await AppDataSource.initialize();
        console.log('✅ Database connected successfully');
        
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        
        // Создаем таблицу для отслеживания миграций, если её нет
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR NOT NULL UNIQUE,
                executed_at TIMESTAMP DEFAULT NOW()
            )
        `);
        
        // Получаем список уже выполненных миграций
        const executedMigrations = await queryRunner.query(
            'SELECT name FROM migrations ORDER BY executed_at'
        );
        const executedNames = executedMigrations.map((m: any) => m.name);
        
        // Получаем список всех миграций из папки
        // Ищем в двух возможных местах: корневой папке migrations и src/migrations
        const possiblePaths = [
            path.join(process.cwd(), 'migrations'),
            path.join(process.cwd(), 'src', 'migrations')
        ];
        
        let migrationsDir = '';
        for (const dir of possiblePaths) {
            if (fs.existsSync(dir)) {
                migrationsDir = dir;
                break;
            }
        }
        
        if (!migrationsDir) {
            console.log('📁 Creating migrations directory...');
            migrationsDir = path.join(process.cwd(), 'migrations');
            fs.mkdirSync(migrationsDir, { recursive: true });
            console.log('✅ Migrations directory created');
        }
        
        console.log(`📁 Looking for migrations in: ${migrationsDir}`);
        
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => (file.endsWith('.ts') || file.endsWith('.js')) && !file.includes('.d.ts'))
            .sort();
        
        console.log(`📁 Found ${migrationFiles.length} migration files`);
        
        if (migrationFiles.length === 0) {
            console.error('❌ No migration files found!');
            console.log('Please create migration files in:', migrationsDir);
            process.exit(1);
        }
        
        let appliedCount = 0;
        
        for (const file of migrationFiles) {
            const migrationName = file.replace('.ts', '').replace('.js', '');
            
            if (!executedNames.includes(migrationName)) {
                console.log(`⏳ Applying migration: ${migrationName}`);
                
                try {
                    // Динамически импортируем миграцию
                    const migrationPath = path.join(migrationsDir, file);
                    console.log(`📄 Loading migration from: ${migrationPath}`);
                    
                    // Для TypeScript файлов используем require с ts-node
                    const migrationModule = require(migrationPath);
                    
                    // Получаем класс миграции (может быть экспортирован по-разному)
                    let MigrationClass;
                    if (migrationModule[migrationName]) {
                        MigrationClass = migrationModule[migrationName];
                    } else if (migrationModule.default) {
                        MigrationClass = migrationModule.default;
                    } else {
                        // Пытаемся найти класс по имени
                        const classes = Object.values(migrationModule).filter(
                            (item: any) => item.prototype && item.prototype.constructor
                        );
                        MigrationClass = classes[0] as any;
                    }
                    
                    if (MigrationClass) {
                        const migration = new MigrationClass();
                        console.log(`🚀 Running up() method for ${migrationName}`);
                        await migration.up(queryRunner);
                        
                        // Сохраняем информацию о выполнении
                        await queryRunner.query(
                            'INSERT INTO migrations (name) VALUES ($1)',
                            [migrationName]
                        );
                        
                        console.log(`✅ Applied: ${migrationName}`);
                        appliedCount++;
                    } else {
                        console.error(`❌ Could not find migration class in: ${file}`);
                        console.log('Available exports:', Object.keys(migrationModule));
                    }
                } catch (error) {
                    console.error(`❌ Error applying migration ${migrationName}:`, error);
                    throw error;
                }
            } else {
                console.log(`✓ Already applied: ${migrationName}`);
            }
        }
        
        if (appliedCount === 0) {
            console.log('✅ All migrations are already applied');
        } else {
            console.log(`✅ Successfully applied ${appliedCount} new migration(s)`);
        }
        
        await queryRunner.release();
        await AppDataSource.destroy();
        
        console.log('🔌 Database connection closed');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runAllMigrations();