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
async function revertLastMigration() {
    try {
        console.log('🔧 Initializing database connection...');
        await data_source_1.AppDataSource.initialize();
        console.log('✅ Database connected successfully');
        const queryRunner = data_source_1.AppDataSource.createQueryRunner();
        await queryRunner.connect();
        // Получаем последнюю примененную миграцию
        const lastMigration = await queryRunner.query('SELECT name FROM migrations ORDER BY executed_at DESC LIMIT 1');
        if (lastMigration.length === 0) {
            console.log('❌ No migrations to revert');
            await queryRunner.release();
            await data_source_1.AppDataSource.destroy();
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
            await data_source_1.AppDataSource.destroy();
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
            await queryRunner.query('DELETE FROM migrations WHERE name = $1', [migrationName]);
            console.log(`✅ Reverted: ${migrationName}`);
        }
        await queryRunner.release();
        await data_source_1.AppDataSource.destroy();
        console.log('🔌 Database connection closed');
    }
    catch (error) {
        console.error('❌ Revert failed:', error);
        process.exit(1);
    }
}
revertLastMigration();
