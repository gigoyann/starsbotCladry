// src/migration/AddUserFieldsToWithdrawals.ts
import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddUserFieldsToWithdrawals1690000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns("withdrawals", [
            new TableColumn({
                name: "username",
                type: "varchar",
                isNullable: true,
            }),
            new TableColumn({
                name: "firstName",
                type: "varchar",
                isNullable: true,
            }),
            new TableColumn({
                name: "lastName",
                type: "varchar",
                isNullable: true,
            }),
            new TableColumn({
                name: "telegramId",
                type: "bigint",
                isNullable: true,
            }),
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("withdrawals", "telegramId");
        await queryRunner.dropColumn("withdrawals", "lastName");
        await queryRunner.dropColumn("withdrawals", "firstName");
        await queryRunner.dropColumn("withdrawals", "username");
    }
}