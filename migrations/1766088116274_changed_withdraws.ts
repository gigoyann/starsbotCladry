// src/migration/ChangeProcessedAtTypeInWithdrawals.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeProcessedAtTypeInWithdrawals1690000000001 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Меняем тип колонки без удаления (если Postgres позволяет)
        await queryRunner.query(`
            ALTER TABLE withdrawals 
            ALTER COLUMN "processedAt" 
            TYPE timestamp USING "processedAt"::timestamp
        `);
        
        // Или если нужно добавить nullable
        await queryRunner.query(`
            ALTER TABLE withdrawals 
            ALTER COLUMN "processedAt" 
            DROP NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Откат 
    }
}