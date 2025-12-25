import * as fs from 'fs';
import * as path from 'path';

function createMigration(name: string) {
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