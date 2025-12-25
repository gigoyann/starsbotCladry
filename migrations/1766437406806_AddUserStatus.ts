import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserStatus1703100000000 implements MigrationInterface {
    name = 'AddUserStatus1703100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Проверяем, существует ли уже колонка status
        const table = await queryRunner.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'status'
        `);

        if (table.length === 0) {
            // Добавляем колонку status в таблицу users
            await queryRunner.query(`
                ALTER TABLE "users" 
                ADD COLUMN "status" VARCHAR DEFAULT 'active'
            `);
            
            console.log('✅ Колонка status добавлена в таблицу users');
        } else {
            console.log('⚠️ Колонка status уже существует в таблице users');
        }
        
        // Обновляем существующие записи
        await queryRunner.query(`
            UPDATE "users" 
            SET "status" = 
                CASE 
                    WHEN "completedInitialSetup" = true THEN 'active'
                    ELSE 'pending'
                END
        `);
        
        console.log('✅ Статусы пользователей обновлены');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Удаляем колонку status
       
    }
}