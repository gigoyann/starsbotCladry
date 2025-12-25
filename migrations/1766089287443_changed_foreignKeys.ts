// src/migration/FixWithdrawalForeignKeyConstraint.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class FixWithdrawalForeignKeyConstraint1690000000002 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Удаляем старый constraint
        await queryRunner.query(`
            ALTER TABLE withdrawals 
            DROP CONSTRAINT IF EXISTS "FK_withdrawals_user"
        `);

        // 2. Создаем правильный constraint (ссылаемся на users.id)
        await queryRunner.query(`
            ALTER TABLE withdrawals 
            ADD CONSTRAINT "FK_withdrawals_user" 
            FOREIGN KEY ("userId") 
            REFERENCES users(id) 
            ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
      
    }
}