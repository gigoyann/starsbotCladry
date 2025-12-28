// src/migration/1690000000004_CreateCaptchaTable.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCaptchaTable1690000000004 implements MigrationInterface {
    name = 'CreateCaptchaTable1690000000004'

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔄 Создание таблицы captchas...');
        
        // Создаем таблицу captchas
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "captchas" (
                "id" SERIAL PRIMARY KEY,
                "userId" bigint NOT NULL,
                "question" VARCHAR NOT NULL,
                "answer" VARCHAR NOT NULL,
                "solved" BOOLEAN NOT NULL DEFAULT false,
                "userAnswer" VARCHAR,
                "attempts" INTEGER NOT NULL DEFAULT 0,
                "type" VARCHAR NOT NULL DEFAULT 'math',
                "options" TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "solvedAt" TIMESTAMP,
                "expiresAt" TIMESTAMP,
                CONSTRAINT "FK_captchas_user" FOREIGN KEY ("userId") REFERENCES "users"("telegramId") ON DELETE CASCADE
            )
        `);

        // Создаем индексы
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_captchas_userId" 
            ON "captchas" ("userId")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_captchas_solved" 
            ON "captchas" ("solved")
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_captchas_expiresAt" 
            ON "captchas" ("expiresAt")
        `);

        console.log('✅ Таблица captchas создана с индексами');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('⬇️ Удаление таблицы captchas...');
        
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_captchas_expiresAt"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_captchas_solved"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_captchas_userId"`);
        await queryRunner.query(`ALTER TABLE "captchas" DROP CONSTRAINT IF EXISTS "FK_captchas_user"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "captchas"`);
        
        console.log('⬇️ Таблица captchas удалена');
    }
}