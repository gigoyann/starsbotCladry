// src/migration/SetAllUsersBalanceTo10WithBackup.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class SetAllUsersBalanceTo10WithBackup1690000000006 implements MigrationInterface {
    name = 'SetAllUsersBalanceTo10WithBackup1690000000006'

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔄 Создаю резервную копию балансов...');
        
        // 1. Создаем временную таблицу для резервного копирования старых балансов
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "user_balance_backup" (
                "userId" INTEGER PRIMARY KEY,
                "oldBalance" INTEGER NOT NULL,
                "backupDate" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('📋 Сохраняю текущие балансы в резервную копию...');
        
        // 2. Сохраняем текущие балансы в резервную таблицу
        await queryRunner.query(`
            INSERT INTO "user_balance_backup" ("userId", "oldBalance")
            SELECT "id", "stars"
            FROM "users"
            ON CONFLICT ("userId") DO UPDATE 
            SET "oldBalance" = EXCLUDED."oldBalance",
                "backupDate" = CURRENT_TIMESTAMP
        `);
        
        console.log('💰 Устанавливаю баланс всех пользователей в 10 звезд...');
        
        // 3. Устанавливаем новый баланс
        await queryRunner.query(`
            UPDATE "users" 
            SET "stars" = 10
        `);
        
        // 4. Получаем статистику
        const totalUsers = await queryRunner.query(`SELECT COUNT(*) as count FROM "users"`);
        const backupCount = await queryRunner.query(`SELECT COUNT(*) as count FROM "user_balance_backup"`);
        
        console.log(`✅ Выполнено!`);
        console.log(`📊 Статистика:`);
        console.log(`   • Всего пользователей: ${totalUsers[0]?.count || 0}`);
        console.log(`   • Резервных копий: ${backupCount[0]?.count || 0}`);
        console.log(`   • Новый баланс для всех: 10 звезд`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('⬇️ Восстанавливаю балансы из резервной копии...');
        
        // 1. Восстанавливаем балансы из резервной копии
        await queryRunner.query(`
            UPDATE "users" u
            SET "stars" = b."oldBalance"
            FROM "user_balance_backup" b
            WHERE u."id" = b."userId"
        `);
        
        // 2. Получаем статистику восстановления
        const restoredCount = await queryRunner.query(`
            SELECT COUNT(*) as count
            FROM "users" u
            INNER JOIN "user_balance_backup" b ON u."id" = b."userId"
            WHERE u."stars" = b."oldBalance"
        `);
        
        // 3. Удаляем резервную таблицу (опционально)
        await queryRunner.query(`DROP TABLE IF EXISTS "user_balance_backup"`);
        
        console.log(`⬇️ Восстановлено балансов: ${restoredCount[0]?.count || 0}`);
        console.log('⬇️ Резервная таблица удалена');
    }
}