// src/migration/MakeUsernameNullable.ts
import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class MakeUsernameNullable1690000000005 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Изменяем колонку username на nullable
        await queryRunner.changeColumn("users", "username", 
            new TableColumn({
                name: "username",
                type: "varchar",
                isNullable: true, // Изменяем на true
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    }
}