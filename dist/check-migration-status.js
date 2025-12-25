"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const data_source_1 = require("./config/data-source");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
async function checkMigrationStatus() {
    try {
        await data_source_1.AppDataSource.initialize();
        console.log('✅ Database connected');
        const queryRunner = data_source_1.AppDataSource.createQueryRunner();
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
            await data_source_1.AppDataSource.destroy();
            return;
        }
        // Получаем выполненные миграции
        const executedMigrations = await queryRunner.query('SELECT name, executed_at FROM migrations ORDER BY executed_at');
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
        executedMigrations.forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.name} (${new Date(m.executed_at).toLocaleString()})`);
        });
        console.log('\n📁 Available migration files:');
        migrationFiles.forEach((file, i) => {
            const isApplied = executedMigrations.some((m) => m.name === file);
            const status = isApplied ? '✅ Applied' : '⏳ Pending';
            console.log(`  ${i + 1}. ${file} - ${status}`);
        });
        const pending = migrationFiles.filter(file => !executedMigrations.some((m) => m.name === file)).length;
        console.log('\n📈 Summary:');
        console.log(`  Total migrations: ${migrationFiles.length}`);
        console.log(`  Applied: ${executedMigrations.length}`);
        console.log(`  Pending: ${pending}`);
        await queryRunner.release();
        await data_source_1.AppDataSource.destroy();
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
checkMigrationStatus();
