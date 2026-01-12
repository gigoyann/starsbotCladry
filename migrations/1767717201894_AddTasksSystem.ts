// src/migration/CreateTasksSystem1690000000007.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTasksSystem1690000000007 implements MigrationInterface {
    name = 'CreateTasksSystem1690000000007'

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🔄 Создаю систему заданий...');

        // 1. Создаем таблицу tasks
        await queryRunner.query(`
            CREATE TABLE "tasks" (
                "id" SERIAL PRIMARY KEY,
                "title" VARCHAR(255) NOT NULL,
                "description" TEXT NOT NULL,
                "type" VARCHAR(50) CHECK ("type" IN ('channel_subscription', 'referral_click', 'bot_subscription')) NOT NULL DEFAULT 'channel_subscription',
                "reward" INTEGER NOT NULL DEFAULT 10,
                "targetUrl" VARCHAR(500),
                "channelUsername" VARCHAR(100),
                "botUsername" VARCHAR(100),
                "inviteLink" VARCHAR(500),
                "maxCompletions" INTEGER NOT NULL DEFAULT 1,
                "totalCompletions" INTEGER NOT NULL DEFAULT 0,
                "status" VARCHAR(50) CHECK ("status" IN ('active', 'inactive', 'completed')) NOT NULL DEFAULT 'active',
                "isAvailable" BOOLEAN NOT NULL DEFAULT TRUE,
                "expirationDate" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Таблица tasks создана');

        // 2. Создаем таблицу user_tasks
        await queryRunner.query(`
            CREATE TABLE "user_tasks" (
                "id" SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "taskId" INTEGER NOT NULL,
                "status" VARCHAR(50) CHECK ("status" IN ('pending', 'completed', 'failed', 'expired')) NOT NULL DEFAULT 'pending',
                "completedAt" TIMESTAMP,
                "attempts" INTEGER NOT NULL DEFAULT 0,
                "clickTime" TIMESTAMP,
                "completionTime" TIMESTAMP,
                "referralClickId" VARCHAR(100),
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "expiredAt" TIMESTAMP,
                "verificationData" JSONB,
                
                CONSTRAINT "FK_user_tasks_userId" 
                    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_user_tasks_taskId" 
                    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE
            )
        `);
        console.log('✅ Таблица user_tasks создана');

        // 3. Создаем таблицу task_clicks
        await queryRunner.query(`
            CREATE TABLE "task_clicks" (
                "id" SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "taskId" INTEGER NOT NULL,
                "clickId" VARCHAR(100) NOT NULL,
                "status" VARCHAR(50) CHECK ("status" IN ('pending', 'completed', 'expired')) NOT NULL DEFAULT 'pending',
                "clickTime" TIMESTAMP NOT NULL,
                "completionTime" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "expiresAt" TIMESTAMP NOT NULL,
                
                CONSTRAINT "FK_task_clicks_userId" 
                    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_task_clicks_taskId" 
                    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE
            )
        `);
        console.log('✅ Таблица task_clicks создана');

        // 4. Создаем индексы для производительности
        console.log('📊 Создаю индексы...');
        
        await queryRunner.query(`
            CREATE INDEX "IDX_user_tasks_user_status" 
            ON "user_tasks"("userId", "status")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_user_tasks_task_status" 
            ON "user_tasks"("taskId", "status")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_user_tasks_click_id" 
            ON "user_tasks"("referralClickId") 
            WHERE "referralClickId" IS NOT NULL
        `);
        
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_task_clicks_clickId" 
            ON "task_clicks"("clickId")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_task_clicks_expires" 
            ON "task_clicks"("expiresAt")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_task_clicks_status" 
            ON "task_clicks"("status")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_tasks_status" 
            ON "tasks"("status", "isAvailable")
        `);
        
        await queryRunner.query(`
            CREATE INDEX "IDX_tasks_type" 
            ON "tasks"("type", "isAvailable")
        `);

        console.log('✅ Индексы созданы');

        // 5. Добавляем триггер для автоматического обновления updatedAt
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW."updatedAt" = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        `);

        await queryRunner.query(`
            CREATE TRIGGER update_tasks_updated_at 
            BEFORE UPDATE ON "tasks"
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);

        // 6. Создаем демо-задания для тестирования системы
        console.log('🎯 Создаю демо-задания...');
        
        // Каналы для подписки
        await queryRunner.query(`
            INSERT INTO "tasks" ("title", "description", "type", "reward", "channelUsername", "maxCompletions")
            VALUES 
            ('Подписка на IT новости', 'Подпишитесь на канал с последними IT новостями и технологиями', 'channel_subscription', 15, '@tech_news', 1),
            ('Новости игр', 'Будьте в курсе последних игровых новостей и обзоров', 'channel_subscription', 20, '@game_news', 1),
            ('Криптовалюты', 'Актуальные новости и аналитика крипторынка', 'channel_subscription', 25, '@crypto_updates', 1)
        `);
        
        // Реферальные задания (переходы по ссылке)
        await queryRunner.query(`
            INSERT INTO "tasks" ("title", "description", "type", "reward", "targetUrl", "maxCompletions")
            VALUES 
            ('Посетите наш сайт', 'Перейдите на наш основной сайт и оставайтесь 2 минуты', 'referral_click', 30, 'https://example.com', 1),
            ('Ознакомьтесь с документацией', 'Изучите документацию нашего проекта', 'referral_click', 25, 'https://docs.example.com', 2),
            ('Тестовый сайт', 'Проверьте работу нашего тестового сайта', 'referral_click', 35, 'https://test.example.com', 1)
        `);
        
        // Подписки на ботов
        await queryRunner.query(`
            INSERT INTO "tasks" ("title", "description", "type", "reward", "botUsername", "maxCompletions")
            VALUES 
            ('Тестовый бот', 'Начните диалог с нашим тестовым ботом', 'bot_subscription', 15, '@test_bot', 1),
            ('Бот поддержки', 'Подпишитесь на бота технической поддержки', 'bot_subscription', 20, '@support_bot', 1)
        `);

        // 7. Получаем статистику
        const tasksCount = await queryRunner.query(`SELECT COUNT(*) as count FROM "tasks"`);
        const channelTasks = await queryRunner.query(`SELECT COUNT(*) as count FROM "tasks" WHERE "type" = 'channel_subscription'`);
        const referralTasks = await queryRunner.query(`SELECT COUNT(*) as count FROM "tasks" WHERE "type" = 'referral_click'`);
        const botTasks = await queryRunner.query(`SELECT COUNT(*) as count FROM "tasks" WHERE "type" = 'bot_subscription'`);

        console.log('🎉 Система заданий успешно создана!');
        console.log('📊 Статистика созданных заданий:');
        console.log(`   • Всего заданий: ${tasksCount[0]?.count || 0}`);
        console.log(`   • Подписки на каналы: ${channelTasks[0]?.count || 0}`);
        console.log(`   • Переходы по ссылкам: ${referralTasks[0]?.count || 0}`);
        console.log(`   • Подписки на ботов: ${botTasks[0]?.count || 0}`);
        console.log('');
        console.log('💡 Система готова к использованию!');
        console.log('   Для добавления новых заданий используйте команду /add_task');
        console.log('   Для просмотра заданий используйте /tasks или кнопку в меню');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('⬇️ Удаляю систему заданий...');

        // 1. Удаляем триггеры
        console.log('🗑️ Удаляю триггеры...');
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_tasks_updated_at ON "tasks"`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column()`);

        // 2. Удаляем таблицы в правильном порядке (с учетом внешних ключей)
        console.log('🗑️ Удаляю таблицы...');
        await queryRunner.query(`DROP TABLE IF EXISTS "task_clicks"`);
        console.log('✅ Таблица task_clicks удалена');

        await queryRunner.query(`DROP TABLE IF EXISTS "user_tasks"`);
        console.log('✅ Таблица user_tasks удалена');

        await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
        console.log('✅ Таблица tasks удалена');

        // 3. Получаем статистику о пользователях для отчета
        const userCount = await queryRunner.query(`SELECT COUNT(*) as count FROM "users"`);
        const activeUsers = await queryRunner.query(`SELECT COUNT(*) as count FROM "users" WHERE "stars" > 0`);

        console.log('⬇️ Система заданий полностью удалена!');
        console.log('📊 Текущая статистика пользователей:');
        console.log(`   • Всего пользователей: ${userCount[0]?.count || 0}`);
        console.log(`   • Активных (с балансом > 0): ${activeUsers[0]?.count || 0}`);
        console.log('');
        console.log('⚠️ Внимание: Все данные о заданиях, кликах и выполненных задачах удалены безвозвратно!');
        console.log('   Если нужна резервная копия, выполните ее перед запуском down миграции.');
    }
}