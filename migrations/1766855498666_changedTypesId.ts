import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeIdTypesToBigInt1690000000003 implements MigrationInterface {
    name = 'ChangeIdTypesToBigInt1690000000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Изменяем telegramId в таблице users на bigint
        await queryRunner.query(`
            ALTER TABLE "users" 
            ALTER COLUMN "telegramId" TYPE bigint 
            USING "telegramId"::bigint
        `);

        // 2. Изменяем userId в таблице games на bigint
        await queryRunner.query(`
            ALTER TABLE "games" 
            ALTER COLUMN "userId" TYPE bigint 
            USING "userId"::bigint
        `);

        // 3. Изменяем userId в таблице withdrawals на bigint
        await queryRunner.query(`
            ALTER TABLE "withdrawals" 
            ALTER COLUMN "userId" TYPE bigint 
            USING "userId"::bigint
        `);

        // 4. Изменяем telegramId в таблице withdrawals на bigint
        await queryRunner.query(`
            ALTER TABLE "withdrawals" 
            ALTER COLUMN "telegramId" TYPE bigint 
            USING "telegramId"::bigint
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Внимание: Откат может вызвать ошибку если есть значения > 2,147,483,647
        
        // 1. Возвращаем telegramId в таблице users обратно к integer
        await queryRunner.query(`
            ALTER TABLE "users" 
            ALTER COLUMN "telegramId" TYPE integer 
            USING "telegramId"::integer
        `);

        // 2. Возвращаем userId в таблице games обратно к integer
        await queryRunner.query(`
            ALTER TABLE "games" 
            ALTER COLUMN "userId" TYPE integer 
            USING "userId"::integer
        `);

        // 3. Возвращаем userId в таблице withdrawals обратно к integer
        await queryRunner.query(`
            ALTER TABLE "withdrawals" 
            ALTER COLUMN "userId" TYPE integer 
            USING "userId"::integer
        `);

        // 4. Возвращаем telegramId в таблице withdrawals обратно к integer
        await queryRunner.query(`
            ALTER TABLE "withdrawals" 
            ALTER COLUMN "telegramId" TYPE integer 
            USING "telegramId"::integer
        `);
    }
}