"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitialSetup1700000000000 = void 0;
class InitialSetup1700000000000 {
    constructor() {
        this.name = 'InitialSetup1700000000000';
    }
    async up(queryRunner) {
        // Таблица пользователей
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                "telegramId" INTEGER UNIQUE NOT NULL,
                username VARCHAR NOT NULL,
                "firstName" VARCHAR,
                "lastName" VARCHAR,
                stars INTEGER NOT NULL DEFAULT 0,
                "totalEarned" INTEGER NOT NULL DEFAULT 0,
                "selectedEmoji" VARCHAR,
                "subscribedToChannels" BOOLEAN NOT NULL DEFAULT FALSE,
                "completedInitialSetup" BOOLEAN NOT NULL DEFAULT FALSE,
                "referrerId" INTEGER,
                "referralsCount" INTEGER NOT NULL DEFAULT 0,
                "referralLinks" TEXT[],
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
        // Индексы для пользователей
        await queryRunner.query(`CREATE INDEX "IDX_users_telegramId" ON users ("telegramId")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_referrerId" ON users ("referrerId")`);
        // Таблица выводов средств
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                amount INTEGER NOT NULL,
                wallet VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'pending',
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "processedAt" TIMESTAMP,
                CONSTRAINT "FK_withdrawals_user" FOREIGN KEY ("userId") REFERENCES users("telegramId") ON DELETE CASCADE
            )
        `);
        // Таблица игр
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "gameType" VARCHAR NOT NULL,
                "betAmount" INTEGER NOT NULL,
                "winAmount" INTEGER NOT NULL,
                result VARCHAR NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                CONSTRAINT "FK_games_user" FOREIGN KEY ("userId") REFERENCES users("telegramId") ON DELETE CASCADE
            )
        `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE games`);
        await queryRunner.query(`DROP TABLE withdrawals`);
        await queryRunner.query(`DROP TABLE users`);
    }
}
exports.InitialSetup1700000000000 = InitialSetup1700000000000;
