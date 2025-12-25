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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function createMigration(name) {
    const timestamp = Date.now();
    const migrationName = `${timestamp}_${name}`;
    const migrationsDir = path.join(__dirname, '../migrations');
    // Создаем папку миграций если её нет
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
    }
    const fileName = `${migrationName}.ts`;
    const filePath = path.join(migrationsDir, fileName);
    const template = `import { MigrationInterface, QueryRunner } from "typeorm";

export class ${migrationName} implements MigrationInterface {
    name = '${migrationName}'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Write your migration UP script here
        // Example:
        // await queryRunner.query(\`
        //     ALTER TABLE users ADD COLUMN IF NOT EXISTS "newColumn" VARCHAR
        // \`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Write your migration DOWN script here
        // Example:
        // await queryRunner.query(\`
        //     ALTER TABLE users DROP COLUMN IF EXISTS "newColumn"
        // \`);
    }
}`;
    fs.writeFileSync(filePath, template);
    console.log(`✅ Created migration: ${fileName}`);
    console.log(`📁 Location: ${filePath}`);
}
// Получаем имя миграции из аргументов командной строки
const migrationName = process.argv[2];
if (!migrationName) {
    console.error('❌ Please provide migration name: npm run migration:create <name>');
    process.exit(1);
}
createMigration(migrationName);
