"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const telegraf_1 = require("telegraf");
const dotenv = __importStar(require("dotenv"));
const data_source_1 = require("./config/data-source");
const User_1 = require("./entities/User");
const Withdrawal_1 = require("./entities/Withdrawal");
const Game_1 = require("./entities/Game");
const google_sheets_service_1 = require("./services/google-sheets.service");
dotenv.config();
class StarBot {
    async setupBotCommands() {
        try {
            const commands = [
                { command: 'start', description: '🚀 Запустить бота' },
                { command: 'games', description: '🎮 Все игры' },
                { command: 'balance', description: '💰 Мой баланс' },
                { command: 'withdraw', description: '💳 Вывод средств' }, // ← Добавлено
                { command: 'referral', description: '👥 Рефералы' },
                { command: 'help', description: '❓ Помощь' }
            ];
            await this.bot.telegram.setMyCommands(commands);
            console.log('✅ Bot commands set successfully');
        }
        catch (error) {
            console.error('❌ Error setting bot commands:', error);
        }
    }
    constructor() {
        this.channels = process.env.CHANNELS?.split(',') || [];
        this.emojis = process.env.EMOJIS?.split(',') || ['⭐', '🌟', '✨', '💫'];
        this.adminId = parseInt(process.env.ADMIN_ID || '0');
        this.bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
        this.initializeDatabase();
        this.adminIds = process.env.ADMIN_IDS
            ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
            : [this.adminId];
        // СНАЧАЛА настраиваем middleware для получения пользователя
        this.setupMiddlewares();
        this.setupBotCommands();
        // Инициализируем Google Sheets если есть ID
        if (process.env.GOOGLE_SHEET_ID) {
            this.googleSheets = new google_sheets_service_1.GoogleSheetsService();
            this.initializeGoogleSheets();
        }
        // ⚡ ВАЖНО: Сохраняем экземпляр бота в глобальной области ДО setupAllHandlers
        global.botInstance = {
            bot: this.bot,
            sendMessage: async (chatId, message, options) => {
                return await this.bot.telegram.sendMessage(chatId, message, options);
            }
        };
        setTimeout(async () => {
            try {
                await this.googleSheets.fixWithdrawalsTable();
                console.log('✅ Таблица выплат проверена и исправлена');
            }
            catch (error) {
                console.error('❌ Ошибка при проверке таблицы:', error);
            }
        }, 10000); // Через 10 секунд после запуска
        // ПОТОМ все обработчики
        this.setupAllHandlers();
        // Запускаем периодические проверки
        this.startPeriodicTasks();
    }
    async initializeGoogleSheets() {
        try {
            await this.googleSheets.initializeSheets();
            await this.googleSheets.setupAllFormatting();
            await this.googleSheets.initializeWithdrawalSheet(); // Инициализируем лист выплат
            console.log('✅ Google Sheets инициализирована');
        }
        catch (error) {
            console.error('❌ Ошибка инициализации Google Sheets:', error);
        }
    }
    // В StarBot классе добавьте метод для безопасной обработки callback query:
    startPeriodicTasks() {
        if (this.googleSheets) {
            // Каждые 2 минуты: проверяем изменения ИЗ таблицы в БД
            setInterval(async () => {
                try {
                    console.log('🔍 Проверка изменений в Google Sheets...');
                    // Проверяем все изменения из таблицы
                    const updatedWithdrawals = await this.googleSheets.checkAndUpdateWithdrawals();
                    const updatedBalances = await this.googleSheets.syncUserBalanceFromSheets();
                    const updatedStatuses = await this.googleSheets.syncUserStatusFromSheets(); // ← ДОБАВЬТЕ ЭТУ СТРОКУ!
                    if (updatedWithdrawals > 0 || updatedBalances > 0 || updatedStatuses > 0) {
                        console.log(`✅ Обновлено из таблицы: ${updatedWithdrawals} выплат, ${updatedBalances} балансов, ${updatedStatuses} статусов`);
                    }
                }
                catch (error) {
                    console.error('❌ Ошибка проверки изменений:', error);
                }
            }, 2 * 60 * 1000); // 2 минуты
            // Каждый час: добавляем только новые данные В таблицу
            setInterval(async () => {
                try {
                    await this.googleSheets.syncNewWithdrawalsOnly();
                    await this.googleSheets.syncAllUsersWithoutOverwrite(); // ← Только новые пользователи
                    console.log('✅ Ежечасное добавление новых данных завершено');
                }
                catch (error) {
                    console.error('❌ Ошибка добавления новых данных:', error);
                }
            }, 60 * 60 * 1000); // 1 час
            // Каждые 24 часа: полная синхронная синхронизация (с осторожностью!)
            setInterval(async () => {
                try {
                    // Используем двустороннюю синхронизацию с правильным порядком
                    await this.googleSheets.bidirectionalSync();
                    console.log('✅ Ежедневная полная синхронизация завершена');
                }
                catch (error) {
                    console.error('❌ Ошибка ежедневной синхронизации:', error);
                }
            }, 5 * 60 * 1000); // 5 мин
        }
    }
    isAdmin(userId) {
        return this.adminIds.includes(userId);
    }
    async broadcastMessage(userIds, message, parseMode) {
        let success = 0;
        let failed = 0;
        console.log(`🔄 Начинаю рассылку для ${userIds.length} пользователей...`);
        for (const userId of userIds) {
            try {
                await this.bot.telegram.sendMessage(userId, message, {
                    parse_mode: parseMode
                });
                success++;
                // Пауза между отправками (50ms) чтобы не превысить лимиты
                if (success % 10 === 0) {
                    console.log(`📤 Отправлено ${success} из ${userIds.length}`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            catch (error) {
                console.error(`❌ Ошибка отправки пользователю ${userId}:`, error.message || error);
                failed++;
            }
        }
        return { success, failed };
    }
    setupBroadcastCommands() {
        // Простая рассылка
        this.bot.command('broadcast', async (ctx) => {
            console.log(`📢 Команда broadcast от пользователя ${ctx.from.id}`);
            if (!this.isAdmin(ctx.from.id)) {
                console.log(`❌ Пользователь ${ctx.from.id} не является админом`);
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды!');
                return;
            }
            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                await ctx.reply('📢 *Рассылка сообщений*\n\n' +
                    'Использование:\n' +
                    '/broadcast текст сообщения\n\n' +
                    'Пример:\n' +
                    '/broadcast Привет всем! Новое обновление уже доступно!\n\n' +
                    'После ввода команды используйте:\n' +
                    '✅ /confirmbroadcast \\- подтвердить\n' +
                    '❌ /cancelbroadcast \\- отменить', { parse_mode: 'Markdown' });
                return;
            }
            const message = args.slice(1).join(' ');
            console.log(`📝 Текст для рассылки: ${message.substring(0, 50)}...`);
            await ctx.reply('🔄 Подготавливаю рассылку...');
            // Показываем предпросмотр
            await ctx.reply('📋 *Предпросмотр сообщения:*\n\n' +
                message + '\n\n' +
                '─' + '─'.repeat(30) + '\n' +
                '✅ Для отправки введите: /confirmbroadcast\n' +
                '❌ Для отмены введите: /cancelbroadcast\n\n' +
                '📊 Сообщение будет отправлено всем пользователям бота', { parse_mode: 'Markdown' });
            // Сохраняем сообщение в глобальную переменную (простой способ)
            global.broadcastMessage = message;
            global.broadcastAdminId = ctx.from.id;
            console.log(`💾 Сохранил сообщение для рассылки от админа ${ctx.from.id}`);
        });
        // Подтверждение рассылки
        this.bot.command('confirmbroadcast', async (ctx) => {
            console.log(`✅ Команда confirmbroadcast от пользователя ${ctx.from.id}`);
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав!');
                return;
            }
            // Проверяем, что сообщение сохранено и это тот же админ
            const storedMessage = global.broadcastMessage;
            const storedAdminId = global.broadcastAdminId;
            if (!storedMessage) {
                await ctx.reply('❌ Нет сообщения для рассылки. Используйте сначала /broadcast');
                return;
            }
            if (storedAdminId !== ctx.from.id) {
                await ctx.reply('❌ Это сообщение было подготовлено другим администратором. Используйте /broadcast для создания своей рассылки.');
                return;
            }
            console.log(`🔄 Получаю список пользователей из базы...`);
            // Получаем всех пользователей из базы данных
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const users = await userRepository.find();
            const userIds = users.map(user => user.telegramId);
            console.log(`👥 Найдено ${userIds.length} пользователей для рассылки`);
            if (userIds.length === 0) {
                await ctx.reply('❌ В базе данных нет пользователей для рассылки!');
                return;
            }
            await ctx.reply(`🔄 *Начинаю рассылку для ${userIds.length} пользователей...*\n\n` +
                `⏳ Это может занять несколько минут.`, { parse_mode: 'Markdown' });
            // Запускаем рассылку
            const result = await this.broadcastMessage(userIds, storedMessage, 'Markdown');
            await ctx.reply('✅ *Рассылка завершена!*\n\n' +
                `📊 *Статистика:*\n` +
                `👥 Всего получателей: ${userIds.length}\n` +
                `✅ Успешно отправлено: ${result.success}\n` +
                `❌ Не удалось отправить: ${result.failed}\n\n` +
                `📈 Успешность: ${Math.round((result.success / userIds.length) * 100)}%`, { parse_mode: 'Markdown' });
            console.log(`✅ Рассылка завершена. Статистика: ${result.success} успешно, ${result.failed} ошибок`);
            // Очищаем временное сообщение
            global.broadcastMessage = undefined;
            global.broadcastAdminId = undefined;
        });
        // Отмена рассылки
        this.bot.command('cancelbroadcast', async (ctx) => {
            console.log(`❌ Команда cancelbroadcast от пользователя ${ctx.from.id}`);
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав!');
                return;
            }
            // Проверяем, что это тот же админ, который создал рассылку
            const storedAdminId = global.broadcastAdminId;
            if (storedAdminId && storedAdminId !== ctx.from.id) {
                await ctx.reply('❌ Вы не можете отменить рассылку, созданную другим администратором.');
                return;
            }
            global.broadcastMessage = undefined;
            global.broadcastAdminId = undefined;
            await ctx.reply('✅ Рассылка отменена.');
        });
        // Рассылка с HTML разметкой
        this.bot.command('broadcasthtml', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды!');
                return;
            }
            const args = ctx.message.text.split(' ');
            if (args.length < 2) {
                await ctx.reply('📢 *Рассылка с HTML разметкой*\n\n' +
                    'Использование:\n' +
                    '/broadcasthtml текст сообщения\n\n' +
                    'Пример:\n' +
                    '/broadcasthtml <b>Важное обновление!</b>\n\n' +
                    'После ввода команды используйте:\n' +
                    '✅ /confirmbroadcasthtml \\- подтвердить\n' +
                    '❌ /cancelbroadcasthtml \\- отменить', { parse_mode: 'Markdown' });
                return;
            }
            const message = args.slice(1).join(' ');
            await ctx.reply('🔄 Подготавливаю рассылку...');
            // Показываем предпросмотр с HTML
            await ctx.reply('📋 *Предпросмотр сообщения (HTML):*\n\n' +
                message + '\n\n' +
                '─' + '─'.repeat(30) + '\n' +
                '✅ Для отправки введите: /confirmbroadcasthtml\n' +
                '❌ Для отмены введите: /cancelbroadcasthtml\n\n' +
                '📊 Сообщение будет отправлено всем пользователям бота', { parse_mode: 'HTML' });
            // Сохраняем сообщение
            global.broadcastMessageHTML = message;
            global.broadcastAdminIdHTML = ctx.from.id;
        });
        // Подтверждение HTML рассылки
        this.bot.command('confirmbroadcasthtml', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав!');
                return;
            }
            const storedMessage = global.broadcastMessageHTML;
            const storedAdminId = global.broadcastAdminIdHTML;
            if (!storedMessage) {
                await ctx.reply('❌ Нет сообщения для рассылки. Используйте сначала /broadcasthtml');
                return;
            }
            if (storedAdminId !== ctx.from.id) {
                await ctx.reply('❌ Это сообщение было подготовлено другим администратором. Используйте /broadcasthtml для создания своей рассылки.');
                return;
            }
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const users = await userRepository.find();
            const userIds = users.map(user => user.telegramId);
            await ctx.reply(`🔄 Начинаю рассылку для ${userIds.length} пользователей...`);
            const result = await this.broadcastMessage(userIds, storedMessage, 'HTML');
            await ctx.reply('✅ *HTML рассылка завершена!*\n\n' +
                `📊 *Статистика:*\n` +
                `👥 Всего получателей: ${userIds.length}\n` +
                `✅ Успешно отправлено: ${result.success}\n` +
                `❌ Не удалось отправить: ${result.failed}`, { parse_mode: 'Markdown' });
            global.broadcastMessageHTML = undefined;
            global.broadcastAdminIdHTML = undefined;
        });
        // Отмена HTML рассылки
        this.bot.command('cancelbroadcasthtml', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав!');
                return;
            }
            const storedAdminId = global.broadcastAdminIdHTML;
            if (storedAdminId && storedAdminId !== ctx.from.id) {
                await ctx.reply('❌ Вы не можете отменить рассылку, созданную другим администратором.');
                return;
            }
            global.broadcastMessageHTML = undefined;
            global.broadcastAdminIdHTML = undefined;
            await ctx.reply('✅ HTML рассылка отменена.');
        });
    }
    setupAllHandlers() {
        // 1. Команда старта
        this.setupBroadcastCommands();
        this.bot.start(async (ctx) => {
            const userId = ctx.from.id;
            const user = ctx.user;
            // Проверяем реферальную ссылку
            const args = ctx.message.text.split(' ');
            if (args.length > 1) {
                const referrerId = parseInt(args[1]);
                if (!user.referrerId && referrerId !== userId) {
                    user.referrerId = referrerId;
                    await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
                }
            }
            // Убедимся, что completedInitialSetup не undefined
            const setupCompleted = user.completedInitialSetup === true;
            if (!setupCompleted) {
                console.log(`🔄 User ${user.telegramId} needs initial setup`);
                await this.showChannelsToSubscribe(ctx);
            }
            else {
                console.log(`✅ User ${user.telegramId} already completed setup`);
                await this.showMainMenu(ctx);
            }
        });
        // Команда для синхронизации
        this.bot.command('sync_sheets', async (ctx) => {
            if (ctx.from.id !== this.adminId) {
                await ctx.reply('⛔ Доступ запрещен');
                return;
            }
            await ctx.reply('🔄 Синхронизация с Google Sheets...');
            await this.googleSheets.fullSync();
            await ctx.reply('✅ Синхронизация завершена');
        });
        // Команда для открытия таблицы
        this.bot.command('sheet', async (ctx) => {
            if (ctx.from.id !== this.adminId) {
                await ctx.reply('⛔ Доступ запрещен');
                return;
            }
            const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`;
            await ctx.reply('📊 Google Sheets админ-панель:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📊 Открыть таблицу', url: sheetUrl }],
                        [{ text: '🔄 Синхронизировать', callback_data: 'admin_sync' }]
                    ]
                }
            });
        });
        // Обработчик кнопки синхронизации
        this.bot.action('admin_sync', async (ctx) => {
            await ctx.answerCbQuery('Синхронизация...');
            await this.googleSheets.fullSync();
            await ctx.answerCbQuery('✅ Синхронизировано');
        });
        this.bot.action('show_help', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showHelp(ctx);
        });
        this.bot.action('play_games', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showGamesMenu(ctx);
        });
        this.bot.action('show_referrals', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showReferralsMenu(ctx);
        });
        this.bot.action('withdraw', async (ctx) => {
            try {
                await this.showWithdrawMenu(ctx);
                await ctx.answerCbQuery(); // Подтверждаем нажатие кнопки
            }
            catch (error) {
                console.error('❌ Error in withdraw action handler:', error);
                await ctx.answerCbQuery('❌ Ошибка при открытии вывода');
            }
        });
        this.bot.command('withdraw', async (ctx) => {
            await this.showWithdrawMenu(ctx);
        });
        this.bot.action(/^withdraw_(\d+)$/, async (ctx) => {
            const amount = parseInt(ctx.match[1]);
            await this.processWithdraw(ctx, amount);
        });
        this.bot.action('withdraw_all', async (ctx) => {
            const user = ctx.user;
            await this.processWithdraw(ctx, user.stars);
        });
        // Обработчик для произвольной суммы
        this.bot.hears(/^\d+$/, async (ctx) => {
            // Проверяем, что пользователь в режиме вывода средств
            if (!ctx.waitingForWithdrawAmount) {
                return; // Игнорируем, если не в режиме вывода
            }
            const text = ctx.message.text;
            await this.processCustomWithdraw(ctx, text);
            // Сбрасываем флаг после обработки
            ctx.waitingForWithdrawAmount = false;
        });
        this.bot.command('fix_sheet', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                return;
            }
            if (this.googleSheets) {
                try {
                    await ctx.reply('🛠️ Начинаю исправление таблицы выплат...');
                    const count = await this.googleSheets.fixWithdrawalsTable();
                    await ctx.reply(`✅ Таблица выплат исправлена!\n` +
                        `📊 Количество записей: ${count}`);
                }
                catch (error) {
                    console.error('❌ Ошибка исправления таблицы:', error);
                    await ctx.reply('❌ Ошибка при исправлении таблицы');
                }
            }
            else {
                await ctx.reply('❌ Google Sheets не настроена');
            }
        });
        // Добавляем обработчики для админа
        this.setupAdminHandlers();
        this.bot.action('copy_referral_link', async (ctx) => {
            await this.copyReferralLink(ctx);
        });
        this.bot.action('share_referral_link', async (ctx) => {
            await this.shareReferralLink(ctx);
        });
        this.bot.command('help', async (ctx) => {
            await this.showHelp(ctx);
        });
        // Обработчик для кнопки помощи - тоже вызывает showHelp
        this.bot.action('show_help', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showHelp(ctx);
        });
        this.bot.command('games', async (ctx) => {
            await this.showGamesMenu(ctx);
        });
        this.bot.command('balance', async (ctx) => {
            const user = ctx.user;
            await ctx.reply(`💰 *Ваш баланс*\n` +
                `═══════════════════\n` +
                `⭐ Звезды: ${user.stars}\n` +
                `💰 Всего заработано: ${user.totalEarned || 0}\n` +
                `═══════════════════`, { parse_mode: 'Markdown' });
        });
        this.bot.command('referral', async (ctx) => {
            const user = ctx.user;
            const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegramId}`;
            await ctx.reply(`👥 *Реферальная система*\n` +
                `═══════════════════\n` +
                `🎯 Ваша реферальная ссылка:\n` +
                `${referralLink}\n\n` +
                `📊 Статистика:\n` +
                `• Приглашено: ${user.referralsCount || 0}\n` +
                `• Заработано: ${(user.referralsCount || 0) * 3} ⭐\n\n` +
                `💰 *Награды:*\n` +
                `• Вы: +3⭐ за каждого друга\n` +
                `• Друг: +10⭐ при регистрации\n` +
                `═══════════════════`, { parse_mode: 'Markdown' });
        });
        // 2. Обработчики игр (единый обработчик для всех игр)
        this.bot.action(/^play_animated_(.+)$/, async (ctx) => {
            const gameType = ctx.match[1];
            // СРАЗУ отвечаем на callback query чтобы избежать таймаута
            try {
                await ctx.answerCbQuery('🎮 Запускаем игру...');
            }
            catch (error) {
                // Если callback устарел, игнорируем ошибку
                if (error.response?.description?.includes('too old') ||
                    error.response?.description?.includes('query ID is invalid')) {
                    console.log('⚠️ Callback query устарел, продолжаем игру без ответа');
                }
                else {
                    console.error('❌ Ошибка answerCbQuery в игре:', error.message);
                }
            }
            const gameConfig = {
                'slots': { bet: 10, method: this.playAnimatedSlots.bind(this) },
                'dice': { bet: 3, method: this.playAnimatedDice.bind(this) },
                'darts': { bet: 4, method: this.playAnimatedDarts.bind(this) },
                'basketball': { bet: 5, method: this.playAnimatedBasketball.bind(this) },
                'football': { bet: 5, method: this.playAnimatedFootball.bind(this) },
                'bowling': { bet: 6, method: this.playAnimatedBowling.bind(this) }
            };
            const config = gameConfig[gameType];
            if (config) {
                try {
                    await config.method(ctx, config.bet);
                }
                catch (error) {
                    console.error(`❌ Ошибка в игре ${gameType}:`, error);
                    // Пытаемся отправить сообщение об ошибке
                    try {
                        await ctx.reply('❌ Произошла ошибка при запуске игры. Попробуйте позже.');
                    }
                    catch (e) {
                        // Игнорируем если не можем отправить сообщение
                    }
                }
            }
        });
        // 3. Обработчики навигации
        this.bot.action('back_to_menu', async (ctx) => {
            try {
                // Сбрасываем флаг
                ctx.waitingForWithdrawAmount = false;
                await this.showMainMenu(ctx);
                await ctx.answerCbQuery();
            }
            catch (error) {
                console.error('❌ Error in back_to_menu handler:', error);
                await ctx.answerCbQuery('❌ Ошибка при возврате в меню');
            }
        });
        this.bot.action('other_game', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showGamesMenu(ctx);
        });
        this.bot.action('play_again', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showGamesMenu(ctx);
        });
        this.bot.action('back_to_games', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showGamesMenu(ctx);
        });
        // 4. Обработчики регистрации и подписки
        this.bot.action(/^check_subscription_(\d+)$/, async (ctx) => {
            const userId = parseInt(ctx.match[1]);
            const user = await this.getUser(userId);
            const isSubscribed = await this.checkAllSubscriptions(userId);
            if (isSubscribed) {
                user.subscribedToChannels = true;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
                // Показываем выбор эмодзи
                await this.showEmojiSelection(ctx);
            }
            else {
                await ctx.reply('❌ Вы не подписались на все каналы. Пожалуйста, подпишитесь и нажмите кнопку проверки снова.');
            }
        });
        this.bot.action(/^select_emoji_(.+)$/, async (ctx) => {
            const emoji = ctx.match[1];
            const user = ctx.user;
            user.selectedEmoji = emoji;
            user.completedInitialSetup = true;
            user.stars += 10;
            // Если есть реферер, начисляем ему 5 звезд
            if (user.referrerId) {
                const referrer = await data_source_1.AppDataSource.getRepository(User_1.User).findOne({
                    where: { telegramId: user.referrerId }
                });
                if (referrer) {
                    referrer.stars += 3;
                    referrer.referralsCount += 1;
                    referrer.referralLinks = [...(referrer.referralLinks || []), `https://t.me/${ctx.botInfo.username}?start=${referrer.telegramId}`];
                    await data_source_1.AppDataSource.getRepository(User_1.User).save(referrer);
                    await ctx.telegram.sendMessage(referrer.telegramId, `🎉 По вашей ссылке зарегистрировался новый пользователь! Вам начислено +3 звезды!`);
                }
            }
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            await ctx.editMessageText(`🎉 Отлично! Вы выбрали эмодзи ${emoji}\n\n` +
                `💰 Вам начислено 10 звезд за регистрацию!\n` +
                `📊 Ваш баланс: ${user.stars} звезд`);
            await this.showMainMenu(ctx);
        });
        // 5. Админ панель
        this.bot.command('admin', async (ctx) => {
            if (ctx.from.id === this.adminId) {
                await this.showAdminPanel(ctx);
            }
        });
        // 6. Дополнительные команды (если есть)
        this.bot.command('help', async (ctx) => {
            await this.showHelp;
        });
        this.bot.action('withdraw_100', async (ctx) => {
            await ctx.answerCbQuery(); // Это важно!
            console.log('withdraw_100 clicked');
            await this.processWithdraw(ctx, 100);
        });
        this.bot.action('withdraw_150', async (ctx) => {
            await ctx.answerCbQuery(); // Это важно!
            console.log('withdraw_150 clicked');
            await this.processWithdraw(ctx, 150);
        });
        this.bot.action('withdraw_200', async (ctx) => {
            await ctx.answerCbQuery(); // Это важно!
            console.log('withdraw_200 clicked');
            await this.processWithdraw(ctx, 200);
        });
        this.bot.action('withdraw_500', async (ctx) => {
            await ctx.answerCbQuery(); // Это важно!
            console.log('withdraw_500 clicked');
            await this.processWithdraw(ctx, 500);
        });
        // Обработчик для "всех средств"
        this.bot.action('withdraw_all', async (ctx) => {
            console.log('withdraw_all clicked');
            const user = ctx.user;
            await this.processWithdraw(ctx, user.stars);
        });
    }
    setupMiddlewares() {
        // Middleware для получения пользователя
        this.bot.use(async (ctx, next) => {
            if (ctx.from) {
                if (!ctx.user) {
                    // Передаем ctx.from для создания пользователя с правильными данными
                    ctx.user = await this.getUser(ctx.from.id, ctx.from);
                }
                if (ctx.user && ctx.user.isBlocked()) {
                    // Пользователь заблокирован
                    console.log(`⛔ Пользователь ${ctx.from.id} заблокирован, доступ запрещен`);
                    // Отправляем сообщение о блокировке
                    try {
                        await ctx.reply('⛔ *Доступ запрещен*\n\n' +
                            'Ваш аккаунт был заблокирован администратором.\n' +
                            'Для получения дополнительной информации обратитесь в поддержку.', { parse_mode: 'Markdown' });
                    }
                    catch (error) {
                        // Игнорируем ошибки отправки сообщений
                    }
                    // Не продолжаем выполнение обработчиков
                    return;
                }
            }
            await next();
        });
        this.bot.use(async (ctx, next) => {
            // Кастим к нужным типам
            const message = ctx.message;
            const callbackQuery = ctx.callbackQuery;
            // Если пользователь отправляет команду, сбрасываем флаг вывода
            if (message?.text?.startsWith?.('/')) {
                ctx.waitingForWithdrawAmount = false;
            }
            // Если пользователь нажимает на другие кнопки меню, сбрасываем флаг
            if (callbackQuery?.data &&
                !callbackQuery.data.startsWith('withdraw_') &&
                callbackQuery.data !== 'withdraw' &&
                callbackQuery.data !== 'withdraw_all') {
                ctx.waitingForWithdrawAmount = false;
            }
            await next();
        });
    }
    async showHelp(ctx) {
        try {
            const helpText = `🎮 *Помощь по боту*\n` +
                `═══════════════════\n` +
                `*Основные команды:*\n` +
                `/start - Запустить бота\n` +
                `/games - Все доступные игры\n` +
                `/balance - Показать баланс\n` +
                `/withdraw - Вывод средств\n` + // ← Добавлено
                `/referral - Реферальная система\n` +
                `/help - Эта справка\n\n` +
                `*Кнопки в меню:*\n` +
                `🎮 Играть - Открыть список игр\n` +
                `👥 Рефералы - Пригласить друзей\n` +
                `💰 Вывод средств - Вывести заработанное\n` +
                `❓ Помощь - Эта справка\n` +
                `═══════════════════\n` +
                `🎲 *Игры и ставки:*\n` +
                `• 🎲 Кости - 3⭐\n` +
                `• 🏀 Баскетбол - 5⭐\n` +
                `• 🎯 Дартс - 4⭐\n` +
                `• ⚽ Футбол - 5⭐\n` +
                `• 🎳 Боулинг - 6⭐\n` +
                `• 🎰 Слоты - 10⭐\n` +
                `═══════════════════\n` +
                `💰 *Реферальная система:*\n` +
                `• Вы получаете 5⭐ за каждого друга\n` +
                `• Друг получает 30⭐ при регистрации\n` +
                `• Минимальный вывод: 100⭐\n` +
                `═══════════════════\n` +
                `💳 *Вывод средств:*\n` + // ← Новый раздел
                `• Минимальная сумма: 100⭐\n` +
                `• Обработка: вручную за 24 часа\n` +
                `═══════════════════\n` +
                `📞 *Поддержка:*\n` +
                `Если у вас есть вопросы или проблемы, обратитесь к администратору.`;
            const keyboard = {
                inline_keyboard: [[
                        { text: '⬅️ Назад в меню', callback_data: 'back_to_menu' }
                    ]]
            };
            if (ctx.callbackQuery) {
                await ctx.editMessageText(helpText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
            else {
                await ctx.reply(helpText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        }
        catch (error) {
            console.error('❌ Error in showHelp:', error);
            await ctx.reply('❌ Ошибка при отображении помощи.');
        }
    }
    async initializeDatabase() {
        try {
            await data_source_1.AppDataSource.initialize();
            console.log('Database connected successfully');
            if (this.googleSheets) {
                await this.googleSheets.initializeSheets();
                // Первоначальная синхронизация через 5 секунд
                setTimeout(async () => {
                    await this.googleSheets.fullSync();
                }, 5000);
            }
        }
        catch (error) {
            console.error('Database connection error:', error);
            process.exit(1);
        }
    }
    // Метод для нормализации статуса пользователя
    async getUser(telegramId, from) {
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            let user = await userRepository.findOne({
                where: { telegramId },
                select: [
                    'id', 'telegramId', 'username', 'firstName', 'lastName',
                    'stars', 'totalEarned', 'selectedEmoji', 'subscribedToChannels',
                    'completedInitialSetup', 'referrerId', 'referralsCount', 'status'
                ]
            });
            if (!user) {
                console.log(`🆕 Creating new user with Telegram ID: ${telegramId}`);
                user = userRepository.create({
                    telegramId,
                    username: from?.username || null, // Используем from если передан
                    firstName: from?.first_name || null,
                    lastName: from?.last_name || null,
                    stars: 0,
                    totalEarned: 0,
                    referralsCount: 0,
                    status: 'active',
                    completedInitialSetup: false,
                    subscribedToChannels: false,
                });
                await userRepository.save(user);
                console.log(`✅ Created new user: ID ${user.id}, Telegram ID ${telegramId}`);
                if (this.googleSheets) {
                    setTimeout(async () => {
                        await this.googleSheets.syncUser(user);
                    }, 1000);
                }
            }
            else if (from) {
                // Обновить информацию о пользователе если она изменилась
                const needsUpdate = user.username !== from.username ||
                    user.firstName !== from.first_name ||
                    user.lastName !== from.last_name;
                if (needsUpdate) {
                    user.username = from.username || user.username;
                    user.firstName = from.first_name || user.firstName;
                    user.lastName = from.last_name || user.lastName;
                    await userRepository.save(user);
                    console.log(`🔄 Updated user info for ID ${user.id}`);
                }
            }
            // Убедимся, что поля не undefined
            user.totalEarned = user.totalEarned || 0;
            user.completedInitialSetup = user.completedInitialSetup || false;
            user.subscribedToChannels = user.subscribedToChannels || false;
            console.log(`✅ User loaded: ID ${user.id}, Telegram ID ${user.telegramId}, Username: ${user.username || 'no username'}`);
            return user;
        }
        catch (error) {
            console.error('❌ Error getting user:', error);
            throw error;
        }
    }
    async showChannelsToSubscribe(ctx) {
        const channels = this.channels;
        const buttons = [];
        // Создаем кнопки для каждого канала
        for (const channel of channels) {
            const urlButton = telegraf_1.Markup.button.url(`📢 Подписаться на ${channel}`, `https://t.me/${channel.replace('@', '')}`);
            buttons.push([urlButton]);
        }
        // Отдельная строка для кнопки проверки
        const checkButton = telegraf_1.Markup.button.callback('✅ Я подписался на все каналы', `check_subscription_${ctx.from.id}`);
        buttons.push([checkButton]);
        await ctx.reply('🎯 Добро пожаловать! Для начала работы необходимо подписаться на наши каналы:\n\n' +
            channels.map(c => `• ${c}`).join('\n'), telegraf_1.Markup.inlineKeyboard(buttons));
    }
    async checkAllSubscriptions(userId) {
        try {
            for (const channel of this.channels) {
                const chatId = channel.startsWith('@') ? channel : `@${channel}`;
                const member = await this.bot.telegram.getChatMember(chatId, userId);
                if (member.status === 'left' || member.status === 'kicked') {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            console.error('Error checking subscription:', error);
            return false;
        }
    }
    async showEmojiSelection(ctx) {
        const buttons = [];
        const emojiPerRow = 3;
        for (let i = 0; i < this.emojis.length; i += emojiPerRow) {
            const row = this.emojis.slice(i, i + emojiPerRow).map(emoji => telegraf_1.Markup.button.callback(emoji, `select_emoji_${emoji}`));
            buttons.push(row);
        }
        await ctx.reply('🎨 Выберите ваш любимый эмодзи:', telegraf_1.Markup.inlineKeyboard(buttons));
    }
    async showMainMenu(ctx) {
        try {
            const user = ctx.user;
            const menuText = `🎮 *Главное меню*\n` +
                `═══════════════════\n` +
                `👤 Имя: ${user.firstName || 'Аноним'}\n` +
                `⭐ Баланс: ${user.stars} ⭐\n` +
                `👥 Рефералов: ${user.referralsCount || 0}\n` +
                `═══════════════════`;
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('🎮 Играть', 'play_games'),
                    telegraf_1.Markup.button.callback('👥 Рефералы', 'show_referrals')
                ],
                [
                    telegraf_1.Markup.button.callback('💰 Вывод средств', 'withdraw'),
                ],
                [
                    telegraf_1.Markup.button.callback('❓ Помощь', 'show_help')
                ]
            ]);
            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            else {
                await ctx.reply(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
        }
        catch (error) {
            console.error('❌ Error in showMainMenu:', error);
            await ctx.reply('❌ Ошибка при отображении меню. Попробуйте снова.');
        }
    }
    // Меню игр (остается без изменений)
    async showGamesMenu(ctx) {
        try {
            const user = ctx.user;
            const menuText = `🎮 *Игры*\n` +
                `═══════════════════\n` +
                `⭐ Баланс: ${user.stars} ⭐\n` +
                `Выберите игру:`;
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('🎲 Кости (3⭐)', 'play_animated_dice'),
                    telegraf_1.Markup.button.callback('🏀 Баскетбол (5⭐)', 'play_animated_basketball')
                ],
                [
                    telegraf_1.Markup.button.callback('🎯 Дартс (4⭐)', 'play_animated_darts'),
                    telegraf_1.Markup.button.callback('⚽ Футбол (5⭐)', 'play_animated_football')
                ],
                [
                    telegraf_1.Markup.button.callback('🎳 Боулинг (6⭐)', 'play_animated_bowling'),
                    telegraf_1.Markup.button.callback('🎰 Слоты (10⭐)', 'play_animated_slots')
                ],
                [
                    telegraf_1.Markup.button.callback('⬅️ Назад в меню', 'back_to_menu')
                ]
            ]);
            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            else {
                await ctx.reply(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
        }
        catch (error) {
            console.error('❌ Error in showGamesMenu:', error);
            await ctx.reply('❌ Ошибка при отображении игр.');
        }
    }
    // Обновленный метод для отображения рефералов с вашей логикой
    async showReferralsMenu(ctx) {
        try {
            const user = ctx.user;
            const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegramId}`;
            const menuText = `👥 *Реферальная система*\n` +
                `═══════════════════\n` +
                `🎯 Ваша реферальная ссылка:\n` +
                `\`${referralLink}\`\n\n` +
                `📊 Статистика:\n` +
                `• Приглашено: ${user.referralsCount || 0}\n` +
                `• Заработано: ${(user.referralsCount || 0) * 3} ⭐\n\n` +
                `💰 *Награды:*\n` +
                `• Вы: +5⭐ за каждого друга\n` +
                `• Друг: +30⭐ при регистрации\n` +
                `═══════════════════`;
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('📋 Копировать ссылку', 'copy_referral_link'),
                    telegraf_1.Markup.button.callback('📤 Поделиться', 'share_referral_link')
                ],
                [
                    telegraf_1.Markup.button.callback('⬅️ Назад в меню', 'back_to_menu')
                ]
            ]);
            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            else {
                await ctx.reply(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
        }
        catch (error) {
            console.error('❌ Error in showReferralsMenu:', error);
            await ctx.reply('❌ Ошибка при отображении рефералов.');
        }
    }
    // Метод для копирования реферальной ссылки
    async copyReferralLink(ctx) {
        try {
            const user = ctx.user;
            const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegramId}`;
            // Отправляем сообщение со ссылкой
            await ctx.reply(`🔗 *Реферальная ссылка скопирована!*\n\n` +
                `\`${referralLink}\`\n\n` +
                `📋 *Как использовать:*\n` +
                `1. Отправьте ссылку другу\n` +
                `2. Друг должен нажать на ссылку и начать диалог с ботом\n` +
                `3. После регистрации вы получите 5⭐\n` +
                `4. Друг получит 30⭐ за регистрацию`, { parse_mode: 'Markdown' });
            await ctx.answerCbQuery('✅ Ссылка скопирована!');
        }
        catch (error) {
            console.error('❌ Error copying referral link:', error);
            await ctx.answerCbQuery('❌ Ошибка при копировании');
        }
    }
    // Метод для поделиться ссылкой (создает пост для пересылки)
    async shareReferralLink(ctx) {
        try {
            const user = ctx.user;
            const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegramId}`;
            const shareText = `🎮 *Присоединяйся к игре!*\n\n` +
                `Зарабатывай звезды и играй в увлекательные игры:\n` +
                `🎲 Кости\n` +
                `🏀 Баскетбол\n` +
                `🎯 Дартс\n` +
                `⚽ Футбол\n` +
                `🎳 Боулинг\n\n` +
                `👉 *Регистрируйся по моей ссылке и получи 30⭐ бонуса:*\n` +
                `${referralLink}\n\n` +
                `🎁 *Бонусы:*\n` +
                `• Ты получишь 30⭐ при регистрации\n` +
                `• Я получу 5⭐ за твое приглашение`;
            await ctx.reply(shareText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                            {
                                text: '🔗 Переслать друзьям',
                                switch_inline_query: `Присоединяйся к игре! Регистрируйся и получи 30⭐: ${referralLink}`
                            }
                        ]]
                }
            });
            await ctx.answerCbQuery('✅ Готово к пересылке!');
        }
        catch (error) {
            console.error('❌ Error sharing referral link:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    }
    async processWithdraw(ctx, amount) {
        console.log('started process');
        try {
            const user = ctx.user;
            const minWithdraw = 100;
            // ПРОВЕРКА USERNAME - отправляем как сообщение
            if (!user.username) {
                const message = '❌ *Для вывода средств необходим username в Telegram!*\n\n' +
                    'Пожалуйста, настройте username в настройках Telegram и попробуйте снова.\n' +
                    'Путь: Настройки → Изменить профиль → Username\n\n' +
                    '📌 *Важно:* Без username мы не сможем связаться с вами для подтверждения выплаты.';
                // ВАЖНО: Сначала отвечаем на callback query (если он есть)
                if (ctx.callbackQuery) {
                    await ctx.answerCbQuery('❌ Username не указан'); // Короткое уведомление
                    // Теперь отправляем полноценное сообщение
                    try {
                        if (ctx.callbackQuery.message) {
                            // Редактируем текущее сообщение
                            await ctx.editMessageText(message, {
                                parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [[
                                            { text: '🔄 Проверить снова', callback_data: 'withdraw' },
                                            { text: '⬅️ В меню', callback_data: 'back_to_menu' }
                                        ]]
                                }
                            });
                        }
                        else {
                            // Если нельзя отредактировать, отправляем новое сообщение
                            await ctx.reply(message, { parse_mode: 'Markdown' });
                        }
                    }
                    catch (editError) {
                        // Если ошибка редактирования, отправляем новое сообщение
                        await ctx.reply(message, { parse_mode: 'Markdown' });
                    }
                }
                else {
                    // Если это обычная команда /withdraw
                    await ctx.reply(message, { parse_mode: 'Markdown' });
                }
                // Сбрасываем флаг ожидания суммы
                ctx.waitingForWithdrawAmount = false;
                return;
            }
            // Проверка минимальной суммы (тоже исправляем для callback query)
            if (amount < minWithdraw) {
                const message = `❌ Минимальная сумма: ${minWithdraw} ⭐`;
                await this.sendErrorMessage(ctx, message, 'withdraw');
                return;
            }
            // Проверка баланса
            if (user.stars < amount) {
                const message = `❌ Недостаточно средств! Нужно: ${amount} ⭐\nВаш баланс: ${user.stars} ⭐`;
                await this.sendErrorMessage(ctx, message, 'withdraw');
                return;
            }
            // Снимаем средства с баланса пользователя
            user.stars -= amount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            // Создаем заявку на вывод и получаем её ID
            const withdrawal = await this.createWithdrawalRequest(user, amount);
            // Отправляем подтверждение пользователю
            const confirmationMessage = `✅ *Заявка на вывод #${withdrawal.id} создана!*\n\n` +
                `💰 Сумма: ${amount} ⭐\n` +
                `📊 Новый баланс: ${user.stars} ⭐\n` +
                `👤 Ваш ID: ${user.telegramId}\n` +
                `👤 Имя: ${user.firstName || 'Не указано'}\n` +
                `👤 Username: @${user.username || 'Не указан'}\n` +
                `⏱️ Статус: В обработке\n` +
                `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
                `⚠️ Заявка будет обработана в течение 24 часов.\n` +
                `📞 Для ускорения свяжитесь с администратором.`;
            ctx.waitingForWithdrawAmount = false;
            // Если это callback query, сначала отвечаем на него, затем отправляем сообщение
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(`✅ Заявка #${withdrawal.id} на ${amount}⭐ отправлена!`);
                // Редактируем текущее сообщение или отправляем новое
                try {
                    if (ctx.callbackQuery.message) {
                        await ctx.editMessageText(confirmationMessage, {
                            parse_mode: 'Markdown'
                        });
                    }
                    else {
                        await ctx.reply(confirmationMessage, { parse_mode: 'Markdown' });
                    }
                }
                catch (editError) {
                    // Если нельзя отредактировать (например, сообщение слишком старое), отправляем новое
                    await ctx.reply(confirmationMessage, { parse_mode: 'Markdown' });
                }
            }
            else {
                // Если это обычное сообщение, просто отвечаем
                await ctx.reply(confirmationMessage, { parse_mode: 'Markdown' });
            }
            // Синхронизируем с Google Sheets
            if (this.googleSheets) {
                await this.googleSheets.syncWithdrawalSimple(withdrawal, this.bot);
            }
            // Отправляем уведомление администратору
            await this.notifyAdminAboutWithdrawal(user, amount, withdrawal.id);
        }
        catch (error) {
            console.error('❌ Error processing withdraw:', error);
            // Возвращаем средства если ошибка
            if (ctx.user) {
                ctx.user.stars += amount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(ctx.user);
            }
            const errorMessage = '❌ Ошибка при создании заявки';
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(errorMessage);
            }
            else {
                await ctx.reply(errorMessage);
            }
            await ctx.reply('❌ Произошла ошибка при создании заявки. Попробуйте позже.');
        }
    }
    async sendErrorMessage(ctx, message, callbackData = 'back_to_menu') {
        ctx.waitingForWithdrawAmount = false;
        if (ctx.callbackQuery) {
            // Сначала отвечаем коротким уведомлением
            await ctx.answerCbQuery('❌ Ошибка');
            try {
                if (ctx.callbackQuery.message) {
                    // Редактируем текущее сообщение
                    await ctx.editMessageText(message, {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                    { text: '🔄 Попробовать снова', callback_data: 'withdraw' },
                                    { text: '⬅️ В меню', callback_data: 'back_to_menu' }
                                ]]
                        }
                    });
                }
                else {
                    await ctx.reply(message, { parse_mode: 'Markdown' });
                }
            }
            catch (error) {
                await ctx.reply(message, { parse_mode: 'Markdown' });
            }
        }
        else {
            await ctx.reply(message, { parse_mode: 'Markdown' });
        }
    }
    // Метод для уведомления пользователя об изменении статуса выплаты
    async notifyUserAboutWithdrawalStatus(withdrawal, status, adminComment) {
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const user = await userRepository.findOne({
                where: { telegramId: withdrawal.telegramId }
            });
            if (!user) {
                console.error(`❌ User not found for withdrawal #${withdrawal.id}`);
                return;
            }
            let message = '';
            let keyboard = undefined;
            if (status === 'completed') {
                message =
                    `✅ *Заявка на вывод #${withdrawal.id} ОДОБРЕНА!*\n\n` +
                        `💰 Сумма: ${withdrawal.amount} ⭐\n` +
                        `📅 Дата обработки: ${new Date().toLocaleString('ru-RU')}\n` +
                        `👤 Обработано администратором\n\n`;
                if (adminComment) {
                    message += `💬 Комментарий администратора:\n${adminComment}\n\n`;
                }
                message += `🎉 Средства будут переведены в ближайшее время.\n` +
                    `📞 Для уточнений свяжитесь с поддержкой.`;
            }
            else if (status === 'rejected') {
                message =
                    `❌ *Заявка на вывод #${withdrawal.id} ОТКЛОНЕНА!*\n\n` +
                        `💰 Сумма: ${withdrawal.amount} ⭐\n` +
                        `📅 Дата отказа: ${new Date().toLocaleString('ru-RU')}\n` +
                        `👤 Отклонено администратором\n\n`;
                if (adminComment) {
                    message += `💬 Причина отказа:\n${adminComment}\n\n`;
                }
                else {
                    message += `💬 Причина отказа: не указана\n\n`;
                }
                message += `💰 *Средства возвращены на ваш баланс!*\n` +
                    `📊 Новый баланс: ${user.stars} ⭐\n\n` +
                    `⚠️ Вы можете создать новую заявку с правильными данными.`;
                // Возвращаем средства пользователю
                user.stars += withdrawal.amount;
                await userRepository.save(user);
                keyboard = {
                    inline_keyboard: [[
                            { text: '💰 Создать новую заявку', callback_data: 'withdraw' },
                            { text: '🏠 В меню', callback_data: 'back_to_menu' }
                        ]]
                };
            }
            else if (status === 'processing') {
                message =
                    `🔄 *Заявка на вывод #${withdrawal.id} в обработке!*\n\n` +
                        `💰 Сумма: ${withdrawal.amount} ⭐\n` +
                        `⏳ Статус: Администратор проверяет заявку\n` +
                        `📅 Начало обработки: ${new Date().toLocaleString('ru-RU')}\n\n` +
                        `⏰ Обычно обработка занимает до 24 часов.\n` +
                        `📞 Для ускорения свяжитесь с администратором.`;
            }
            // Отправляем уведомление пользователю
            await this.bot.telegram.sendMessage(user.telegramId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            console.log(`✅ User ${user.telegramId} notified about withdrawal #${withdrawal.id} status: ${status}`);
        }
        catch (error) {
            console.error(`❌ Error notifying user about withdrawal #${withdrawal.id}:`, error);
        }
    }
    // Метод для создания заявки в БД
    async createWithdrawalRequest(user, amount) {
        try {
            console.log(`🔍 Creating withdrawal for user ID: ${user.id}, telegramId: ${user.telegramId}`);
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const withdrawal = new Withdrawal_1.Withdrawal();
            withdrawal.userId = user?.id;
            withdrawal.amount = amount;
            withdrawal.wallet = 'user_data';
            withdrawal.status = 'pending';
            withdrawal.username = user?.username;
            withdrawal.firstName = user?.firstName;
            withdrawal.lastName = user?.lastName;
            withdrawal.telegramId = user?.telegramId;
            const savedWithdrawal = await withdrawalRepository.save(withdrawal);
            console.log(`✅ Withdrawal created with ID: ${savedWithdrawal.id}`);
            return savedWithdrawal;
        }
        catch (error) {
            console.error('❌ Error creating withdrawal request:', error);
            throw error;
        }
    }
    // Метод для уведомления администратора
    async notifyAdminAboutWithdrawal(user, amount, withdrawalId) {
        try {
            if (this.adminId) {
                const message = `📋 *НОВАЯ ЗАЯВКА НА ВЫВОД*\n\n` +
                    `🆔 ID заявки: #${withdrawalId}\n` +
                    `💰 Сумма: ${amount} ⭐\n` +
                    `👤 Пользователь: ${user.firstName || 'Не указано'}\n` +
                    `🆔 User ID: ${user.telegramId}\n` +
                    `👤 Username: @${user.username || 'Не указан'}\n` +
                    `⭐ Баланс после списания: ${user.stars}\n` +
                    `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
                    `💾 Добавлено в Google Sheets`;
                await this.bot.telegram.sendMessage(this.adminId, message, {
                    parse_mode: 'Markdown'
                });
            }
        }
        catch (error) {
            console.error('❌ Error notifying admin:', error);
        }
    }
    // Метод для произвольной суммы
    async processCustomWithdraw(ctx, amountText) {
        try {
            const amount = parseInt(amountText);
            if (isNaN(amount) || amount <= 0) {
                await ctx.reply('❌ Пожалуйста, введите корректную сумму (число больше 0)');
                return;
            }
            await this.processWithdraw(ctx, amount);
        }
        catch (error) {
            console.error('❌ Error processing custom withdraw:', error);
            await ctx.reply('❌ Ошибка при обработке суммы');
        }
    }
    // Метод для вывода средств
    async showWithdrawMenu(ctx) {
        try {
            const user = ctx.user;
            const minWithdraw = 100;
            ctx.waitingForWithdrawAmount = true;
            const menuText = `💰 *Вывод средств*\n` +
                `═══════════════════\n` +
                `⭐ Баланс: ${user.stars}\n` +
                `💰 Мин. сумма: ${minWithdraw}\n` +
                `═══════════════════`;
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('100 ⭐', 'withdraw_100'),
                    telegraf_1.Markup.button.callback('150 ⭐', 'withdraw_150')
                ],
                [
                    telegraf_1.Markup.button.callback('200 ⭐', 'withdraw_200'),
                    telegraf_1.Markup.button.callback('500 ⭐', 'withdraw_500')
                ],
                [
                    telegraf_1.Markup.button.callback('Все ⭐', 'withdraw_all')
                ],
                [
                    telegraf_1.Markup.button.callback('⬅️ Назад в меню', 'back_to_menu')
                ]
            ]);
            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
            else {
                await ctx.reply(menuText, {
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            }
        }
        catch (error) {
            console.error('❌ Error in showWithdrawMenu:', error);
            await ctx.reply('❌ Ошибка при отображении вывода.');
        }
    }
    setupMenuHandlers() {
        // Баланс
        this.bot.hears('💰 Мой баланс', async (ctx) => {
            const user = ctx.user;
            await ctx.reply(`💰 Ваш баланс:\n\n` +
                `⭐ Звезд: ${user.stars}\n` +
                `🏆 Всего заработано: ${user.totalEarned}\n` +
                `👥 Приглашено друзей: ${user.referralsCount}`);
        });
        // Бонус и игры
        this.bot.hears('🎮 Бонус и игры', async (ctx) => {
            await this.showGamesMenu(ctx);
        });
        // Вывод средств
        this.bot.hears('📤 Вывод средств', async (ctx) => {
            const user = ctx.user;
            if (user.stars < 100) {
                await ctx.reply(`❌ Минимальная сумма для вывода: 100 звезд\n` +
                    `💰 Ваш текущий баланс: ${user.stars} звезд`);
                return;
            }
            await ctx.reply('💳 Для вывода средств введите сумму (от 100 звезд) и кошелек в формате:\n\n' +
                '`<сумма> <кошелек>`\n\n' +
                'Пример: `150 U1234567890`', { parse_mode: 'Markdown' });
        });
        // Реферальная система
        this.bot.hears('👥 Реферальная система', async (ctx) => {
            const user = ctx.user;
            const botUsername = ctx.botInfo.username;
            const refLink = `https://t.me/${botUsername}?start=${user.telegramId}`;
            await ctx.reply(`👥 Реферальная система\n\n` +
                `🔗 Ваша реферальная ссылка:\n\`${refLink}\`\n\n` +
                `💰 За каждого приглашенного друга вы получаете:\n` +
                `• 3 звезд после его полной регистрации\n\n` +
                `👥 Приглашено: ${user.referralsCount} друзей\n` +
                `💎 Всего заработано на рефералах: ${(user.referralsCount * 3)} звезд`, { parse_mode: 'Markdown' });
        });
        // Задания
        this.bot.hears('ℹ️ Задания', async (ctx) => {
            await ctx.reply('📋 Актуальных заданий пока нет.\n\n' +
                'Мы сообщим вам, когда появятся новые задания! 🎯');
        });
        // Обработка запроса на вывод
        this.bot.on('text', async (ctx) => {
            const message = ctx.message.text;
            const user = ctx.user;
            if (message.match(/^\d+\s+\S+$/)) {
                const [amountStr, wallet] = message.split(/\s+/);
                const amount = parseInt(amountStr);
                if (amount < 100) {
                    await ctx.reply('❌ Минимальная сумма для вывода: 100 звезд');
                    return;
                }
                if (user.stars < amount) {
                    await ctx.reply('❌ Недостаточно средств на балансе');
                    return;
                }
                // Создаем заявку на вывод
                const withdrawal = new Withdrawal_1.Withdrawal();
                withdrawal.userId = user.telegramId;
                withdrawal.amount = amount;
                withdrawal.wallet = wallet;
                withdrawal.status = 'pending';
                await data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal).save(withdrawal);
                // Списание средств
                user.stars -= amount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
                // Уведомляем админа
                const botUsername = ctx.botInfo.username;
                const userRefLink = `https://t.me/${botUsername}?start=${user.telegramId}`;
                await ctx.telegram.sendMessage(this.adminId, `📤 НОВАЯ ЗАЯВКА НА ВЫВОД\n\n` +
                    `👤 Пользователь: @${user.username || 'Нет username'}\n` +
                    `🆔 ID: ${user.telegramId}\n` +
                    `💰 Сумма: ${amount} звезд\n` +
                    `💳 Кошелек: ${wallet}\n` +
                    `👥 Рефералов: ${user.referralsCount}\n` +
                    `🔗 Ссылка на пользователя: ${userRefLink}\n` +
                    `📊 Всего заработано: ${user.totalEarned} звезд\n\n` +
                    `🔗 Реферальные ссылки:\n${user.referralLinks?.join('\n') || 'Нет рефералов'}`);
                await ctx.reply('✅ Заявка на вывод успешно создана!\n\n' +
                    '💰 Сумма: ' + amount + ' звезд\n' +
                    '💳 Кошелек: ' + wallet + '\n\n' +
                    '⏳ Ожидайте обработки заявки администратором.');
            }
        });
    }
    setupGamesHandlers() {
        console.log('🎮 Setting up ANIMATED game handlers...');
        // Игры с анимацией Telegram Dice API
        this.bot.hears('🎰 Игровые автоматы', async (ctx) => {
            await this.playAnimatedSlots(ctx, 10);
        });
        this.bot.hears('🎲 Кости с анимацией', async (ctx) => {
            await this.playAnimatedDice(ctx, 3);
        });
        this.bot.hears('🎯 Дартс с анимацией', async (ctx) => {
            await this.playAnimatedDarts(ctx, 4);
        });
        this.bot.hears('🏀 Баскетбол', async (ctx) => {
            await this.playAnimatedBasketball(ctx, 5);
        });
        this.bot.hears('⚽ Футбол', async (ctx) => {
            await this.playAnimatedFootball(ctx, 5);
        });
        this.bot.hears('🎳 Боулинг', async (ctx) => {
            await this.playAnimatedBowling(ctx, 6);
        });
        // Статистика
        // Баланс
        // this.bot.hears('💰 Мой баланс', async (ctx) => {
        //     await this.showBalance(ctx);
        // });
        this.bot.hears('↩️ Назад в меню', async (ctx) => {
            await this.showMainMenu(ctx);
        });
    }
    async playAnimatedGame(ctx, betAmount, emoji, // Добавлены ⚽ и 🎳
    gameType, calculateWin) {
        try {
            console.log(`🎮 Starting ${gameType} game with ${emoji}`);
            // Получаем пользователя
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            console.log(`💰 User ${user.telegramId} balance: ${user.stars}`);
            // Проверяем баланс
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            // Списываем ставку
            user.stars -= betAmount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            console.log(`💰 Bet ${betAmount} deducted`);
            // Отправляем анимацию
            console.log(`🎬 Sending ${emoji} animation...`);
            const animation = await ctx.replyWithDice({ emoji });
            // Ждем завершения анимации
            await new Promise(resolve => setTimeout(resolve, 4000));
            // Получаем результат
            const diceValue = animation.dice.value;
            console.log(`🎮 ${emoji} result value: ${diceValue}`);
            // Рассчитываем выигрыш
            const winResult = calculateWin(diceValue, betAmount);
            const { winAmount, resultText } = winResult;
            // Начисляем выигрыш
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
                console.log(`💰 Win ${winAmount} stars added`);
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = gameType;
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            // Показываем результат
            await this.showAnimatedGameResult(ctx, user, gameType, emoji, diceValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error(`❌ Error in ${gameType}:`, error);
            await ctx.reply(`❌ Ошибка в игре ${gameType}`);
        }
    }
    async playAnimatedSlots(ctx, betAmount) {
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            user.stars -= betAmount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            const animation = await ctx.replyWithDice({ emoji: '🎰' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const slotValue = animation.dice.value;
            const winResult = this.calculateSlotWin(slotValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            }
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_slots';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            await this.showAnimatedGameResult(ctx, user, 'animated_slots', '🎰', slotValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error('❌ Error in playAnimatedSlots:', error);
            await ctx.reply('❌ Ошибка в игровых автоматах');
        }
    }
    calculateSlotWin(slotsValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        // ТОЛЬКО ПОЛНЫЕ КОМБИНАЦИИ ОДИНАКОВЫХ СИМВОЛОВ:
        // 64 = 7️⃣7️⃣7️⃣ ДЖЕКПОТ (x100)
        // 43 = 🍊🍊🍊 (x1)
        // 22 = 🍒🍒🍒 (x5)
        // 1 = 🍋🍋🍋 (x2)
        // ВСЕ ОСТАЛЬНЫЕ - ПРОИГРЫШ (включая 60-63)
        // 7️⃣7️⃣7️⃣ - ДЖЕКПОТ (значение 64)
        if (slotsValue === 64) {
            winMultiplier = 100;
            resultText = `🎰 7️⃣7️⃣7️⃣`;
        }
        // 🍒 🍒 🍒 (значение 22)
        else if (slotsValue === 22) {
            winMultiplier = 5;
            resultText = `🎰 🍒🍒🍒`;
        }
        // 🍋 🍋 🍋 (значение 1)
        else if (slotsValue === 1) {
            winMultiplier = 2;
            resultText = `🎰`;
        }
        // 🍊 🍊 🍊 (значение 43)
        else if (slotsValue === 43) {
            winMultiplier = 1;
            resultText = `🎰 🍊🍊🍊`;
        }
        else {
            // ВСЕ ОСТАЛЬНЫЕ ЗНАЧЕНИЯ - ПРОИГРЫШ
            // включая 60-63 (это НЕ три BAR!)
            winMultiplier = 0;
            // Определяем текст проигрыша
            if (slotsValue >= 60 && slotsValue <= 63) {
                // Значения 60-63 - это смешанные комбинации с 7
                resultText = `🎰 Смешанная комбинация...`;
            }
            else if (slotsValue > 50) {
                resultText = `🎰 Не повезло...`;
            }
            else if (slotsValue > 30) {
                resultText = `🎰 Почти...`;
            }
            else if (slotsValue > 20) {
                resultText = `🎰 Увы...`;
            }
            else {
                resultText = `🎰 Промах...`;
            }
        }
        const winAmount = Math.floor(betAmount * winMultiplier);
        console.log(`🎰 Выпало: ${slotsValue}, Множитель: x${winMultiplier}, Выигрыш: ${winAmount}`);
        return {
            winAmount: winAmount,
            resultText: `${resultText}`
        };
    }
    async playAnimatedDice(ctx, betAmount) {
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            user.stars -= betAmount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            const animation = await ctx.replyWithDice({ emoji: '🎲' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const diceValue = animation.dice.value;
            const winResult = this.calculateDiceWin(diceValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            }
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_dice';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            await this.showAnimatedGameResult(ctx, user, 'animated_dice', '🎲', diceValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error('❌ Error in playAnimatedDice:', error);
            await ctx.reply('❌ Ошибка в игре в кости');
        }
    }
    calculateDiceWin(diceValue, betAmount) {
        let winMultiplier = 0;
        const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        const diceEmoji = diceEmojis[diceValue] || '🎲';
        let resultText = '';
        if (diceValue === 6) {
            // Максимальное значение - наибольший выигрыш
            winMultiplier = 3;
            resultText = `🎲 *ШЕСТЕРКА!* Максимальный результат! ${diceEmoji}`;
        }
        else if (diceValue === 5) {
            // 5 очков - очень хорошо
            winMultiplier = 2;
            resultText = `🎲 *Отлично!* 5 очков ${diceEmoji}`;
        }
        else if (diceValue === 4) {
            // 4 очка - хорошо
            winMultiplier = 1;
            resultText = `🎲 *Отлично!* 4 очков ${diceEmoji}`;
        }
        else if (diceValue === 3) {
            // 3 очка - средне
            winMultiplier = 0;
            resultText = `🎲 *Плохо!* 3 очка ${diceEmoji}`;
        }
        else if (diceValue === 2) {
            // 2 очка - слабый результат
            winMultiplier = 0;
            resultText = `🎲 *Плохо!* 2 очка ${diceEmoji}`;
        }
        else {
            // diceValue === 1 - минимальный результат
            winMultiplier = 0; // или 0, если хотите чтобы 1 была проигрышем
            resultText = `🎲 *Единица...* Минимальный результат ${diceEmoji}`;
        }
        return {
            winAmount: Math.floor(betAmount * winMultiplier),
            resultText: `${resultText} (${diceValue}/6)`
        };
    }
    async playAnimatedDarts(ctx, betAmount) {
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            user.stars -= betAmount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            const animation = await ctx.replyWithDice({ emoji: '🎯' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const dartsValue = animation.dice.value;
            const winResult = this.calculateDartsWin(dartsValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            }
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_darts';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            await this.showAnimatedGameResult(ctx, user, 'animated_darts', '🎯', dartsValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error('❌ Error in playAnimatedDarts:', error);
            await ctx.reply('❌ Ошибка в игре в дартс');
        }
    }
    calculateDartsWin(dartsValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (dartsValue === 6) {
            // Яблочко - максимальный выигрыш
            winMultiplier = 3; // можно увеличить до 10, если хотите больше награды
            resultText = `🎯 *В ЯБЛОЧКО!* Идеальное попадание!`;
        }
        else if (dartsValue === 5) {
            // Близко к центру
            winMultiplier = 2;
            resultText = `🎯 *Очень близко!* Почти в яблочко`;
        }
        else if (dartsValue === 4) {
            // Внутреннее кольцо
            winMultiplier = 1.5;
            resultText = `🎯 *Хороший бросок!* Внутреннее кольцо`;
        }
        else if (dartsValue === 3) {
            // Среднее кольцо
            winMultiplier = 0;
            resultText = `🎯 *Попадание!* Среднее кольцо`;
        }
        else if (dartsValue === 2) {
            // Внешнее кольцо - минимальный выигрыш
            winMultiplier = 0;
            resultText = `🎯 *Попадание!* Внешнее кольцо`;
        }
        else {
            // dartsValue === 1 - Полный промах
            winMultiplier = 0;
            resultText = `🎯 *Промах...* Мимо мишени`;
        }
        return {
            winAmount: Math.floor(betAmount * winMultiplier),
            resultText
        };
    }
    async playAnimatedBasketball(ctx, betAmount) {
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            user.stars -= betAmount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            const animation = await ctx.replyWithDice({ emoji: '🏀' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const basketballValue = animation.dice.value;
            const winResult = this.calculateBasketballWin(basketballValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            }
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_basketball';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            await this.showAnimatedGameResult(ctx, user, 'animated_basketball', '🏀', basketballValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error('❌ Error in playAnimatedBasketball:', error);
            await ctx.reply('❌ Ошибка в игре в баскетбол');
        }
    }
    calculateBasketballWin(basketballValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (basketballValue === 5) {
            // Сверхдальний бросок/трехочковый
            winMultiplier = 3; // можно оставить 8, если хотите большую награду
            resultText = `🏀 *СВЕРХДАЛЬНИЙ БРОСОК!* Трехочковый!`;
        }
        else if (basketballValue === 4) {
            // Средний бросок
            winMultiplier = 2;
            resultText = `🏀 *Красивый бросок!* Попадание со средней дистанции`;
        }
        else if (basketballValue === 3) {
            // Ближний бросок
            winMultiplier = 0; // или 2, если хотите
            resultText = `🏀 *Попадание!* Ближний бросок`;
        }
        else if (basketballValue === 2) {
            // Удар о щиток - НЕ ВЫИГРЫШ
            winMultiplier = 0;
            resultText = `🏀 *Щиток...* Мяч отскочил от щитка`;
        }
        else {
            // basketballValue === 1 - Полный промах
            winMultiplier = 0;
            resultText = `🏀 *Промах...* Мяч не долетел до корзины`;
        }
        return {
            winAmount: Math.floor(betAmount * winMultiplier),
            resultText
        };
    }
    async playAnimatedFootball(ctx, betAmount) {
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            user.stars -= betAmount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            const animation = await ctx.replyWithDice({ emoji: '⚽' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const footballValue = animation.dice.value;
            const winResult = this.calculateFootballWin(footballValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            }
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_football';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            await this.showAnimatedGameResult(ctx, user, 'animated_football', '⚽', footballValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error('❌ Error in playAnimatedFootball:', error);
            await ctx.reply('❌ Ошибка в игре в футбол');
        }
    }
    calculateFootballWin(footballValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (footballValue === 5) {
            // Самый верхний угол - идеальный гол
            winMultiplier = 3; // можно оставить 8 для большей награды
            resultText = `⚽ *ИДЕАЛЬНЫЙ ГОЛ!* Верхний угол!`;
        }
        else if (footballValue === 4) {
            // Верхний угол - отличный гол
            winMultiplier = 2;
            resultText = `⚽ *ВЕРХНИЙ УГОЛ!* Отличный удар!`;
        }
        else if (footballValue === 3) {
            // Попадание в ворота - обычный гол
            winMultiplier = 1;
            resultText = `⚽ *ГОЛ!* Мяч в воротах!`;
        }
        else if (footballValue === 2) {
            // Попадание в штангу/перекладину - НЕ ГОЛ
            winMultiplier = 0;
            resultText = `⚽ *ШТАНГА!* Мяч отскочил от перекладины`;
        }
        else {
            // footballValue === 1 - Полный промах
            winMultiplier = 0;
            resultText = `⚽ *Мимо...* Мяч не попал в ворота`;
        }
        return {
            winAmount: Math.floor(betAmount * winMultiplier),
            resultText
        };
    }
    async playAnimatedBowling(ctx, betAmount) {
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            user.stars -= betAmount;
            await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            const animation = await ctx.replyWithDice({ emoji: '🎳' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const bowlingValue = animation.dice.value;
            const winResult = this.calculateBowlingWin(bowlingValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            }
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_bowling';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            await this.showAnimatedGameResult(ctx, user, 'animated_bowling', '🎳', bowlingValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error('❌ Error in playAnimatedBowling:', error);
            await ctx.reply('❌ Ошибка в игре в боулинг');
        }
    }
    calculateBowlingWin(bowlingValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (bowlingValue === 6) {
            // Страйк - все кегли сбиты
            winMultiplier = 3; // уменьшил с 12 для баланса
            resultText = `🎳 *СТРАЙК!* Все кегли сбиты! ${bowlingValue}/6`;
        }
        else if (bowlingValue === 5) {
            // Почти страйк - 5 кеглей
            winMultiplier = 2;
            resultText = `🎳 *Почти страйк!* 5 кеглей ${bowlingValue}/6`;
        }
        else if (bowlingValue === 4) {
            // Хороший бросок - 4 кегли
            winMultiplier = 1;
            resultText = `🎳 *Отличный бросок!* 4 кегли ${bowlingValue}/6`;
        }
        else if (bowlingValue === 3) {
            // Средний результат - 3 кегли
            winMultiplier = 0;
            resultText = `🎳 *Хороший бросок!* 3 кегли ${bowlingValue}/6`;
        }
        else if (bowlingValue === 2) {
            // Слабый бросок - 2 кегли
            winMultiplier = 0;
            resultText = `🎳 *Попадание!* 2 кегли ${bowlingValue}/6`;
        }
        else if (bowlingValue === 1) {
            // Слабый бросок - 2 кегли
            winMultiplier = 0;
            resultText = `🎳 *Слабый бросок...* 1 кегля ${bowlingValue}/6`;
        }
        else if (bowlingValue === 0) {
            // Слабый бросок - 2 кегли
            winMultiplier = 0;
            resultText = `🎳 *Слабый бросок...*`;
        }
        else {
            // bowlingValue === 1 - Очень слабый бросок - 1 кегля
            winMultiplier = 0; // или 0 для полного проигрыша
            resultText = `🎳 *Слабый бросок...* 0 кегля ${bowlingValue}/6`;
        }
        return {
            winAmount: Math.floor(betAmount * winMultiplier),
            resultText
        };
    }
    async showAnimatedGameResult(ctx, user, gameType, emoji, diceValue, betAmount, winAmount, resultText) {
        const gameNames = {
            'animated_slots': '🎰 Игровые автоматы',
            'animated_dice': '🎲 Кости',
            'animated_darts': '🎯 Дартс',
            'animated_basketball': '🏀 Баскетбол',
            'animated_football': '⚽ Футбол',
            'animated_bowling': '🎳 Боулинг'
        };
        const gameName = gameNames[gameType] || gameType;
        // Определяем эмодзи результата
        let resultEmoji = '';
        let resultTitle = '';
        if (winAmount > betAmount * 10) {
            resultEmoji = '🏆';
            resultTitle = '*МЕГА ДЖЕКПОТ!*';
        }
        else if (winAmount > betAmount * 5) {
            resultEmoji = '💰';
            resultTitle = '*БОЛЬШОЙ ВЫИГРЫШ!*';
        }
        else if (winAmount > 0) {
            resultEmoji = '🎉';
            resultTitle = '*ВЫ ВЫИГРАЛИ!*';
        }
        else {
            resultEmoji = '😔';
            resultTitle = '*Попробуйте еще раз*';
        }
        const message = `${emoji} *${gameName}*\n` +
            `═══════════════════\n` +
            `${resultEmoji} ${resultTitle}\n` +
            `${resultText}\n\n` +
            `💰 *Ставка:* ${betAmount} ⭐\n` +
            `🏆 *Выигрыш:* ${winAmount} ⭐\n` +
            `⭐ *Баланс:* ${user.stars} ⭐\n` +
            `═══════════════════`;
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: `${emoji} Играть еще`, callback_data: `play_${gameType}` },
                        { text: '🎮 Другая игра', callback_data: 'other_game' }
                    ],
                    [
                        { text: '🏠 В меню', callback_data: 'back_to_menu' }
                    ]
                ]
            }
        });
    }
    async showGameStats(ctx) {
        const user = ctx.user;
        // Получаем статистику игр пользователя
        const gameRepo = data_source_1.AppDataSource.getRepository(Game_1.Game);
        const stats = await gameRepo
            .createQueryBuilder('game')
            .select('game.gameType', 'type')
            .addSelect('COUNT(*)', 'total')
            .addSelect('SUM(CASE WHEN game.result = "win" THEN 1 ELSE 0 END)', 'wins')
            .addSelect('SUM(game.betAmount)', 'totalBet')
            .addSelect('SUM(game.winAmount)', 'totalWin')
            .where('game.userId = :userId', { userId: user.telegramId })
            .groupBy('game.gameType')
            .getRawMany();
        let message = '📊 *СТАТИСТИКА ИГР*\n\n';
        if (stats.length === 0) {
            message += 'Вы еще не играли в игры.\nНачните с игрового зала!';
        }
        else {
            stats.forEach((stat) => {
                const profit = stat.totalWin - stat.totalBet;
                const winRate = (stat.wins / stat.total * 100).toFixed(1);
                message += `*${this.getGameName(stat.type)}:*\n`;
                message += `🎮 Игр: ${stat.total}\n`;
                message += `✅ Побед: ${stat.wins} (${winRate}%)\n`;
                message += `💰 Прибыль: ${profit} звезд\n\n`;
            });
        }
        await ctx.reply(message, { parse_mode: 'Markdown' });
    }
    getGameName(gameType) {
        const names = {
            'animated_slots': '🎰 Игровые автоматы',
            'animated_dice': '🎲 Кости',
            'animated_darts': '🎯 Дартс',
            'animated_basketball': '🏀 Баскетбол',
            'animated_football': '⚽ Футбол',
            'animated_bowling': '🎳 Боулинг',
            'slots': '🎰 Слоты',
            'dice': '🎲 Кости',
            'darts': '🎯 Дартс',
            'basketball': '🏀 Баскетбол',
            'football': '⚽ Футбол',
            'bowling': '🎳 Боулинг'
        };
        return names[gameType] || gameType;
    }
    async processGameResult(ctx, user, gameType, betAmount, winAmount, resultText) {
        try {
            // Сохраняем игру в базу
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = gameType;
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
            // Начисляем выигрыш если есть
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
            }
            // Формируем финальное сообщение
            const message = `${resultText}\n\n` +
                `💰 Ставка: ${betAmount} звезд\n` +
                `🎁 Выигрыш: ${winAmount} звезд\n` +
                `📊 Баланс: ${user.stars} звезд`;
            await ctx.reply(message, { parse_mode: 'Markdown' });
            // Добавляем кнопку для новой игры
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                telegraf_1.Markup.button.callback('🎮 Играть еще', 'play_again'),
                telegraf_1.Markup.button.callback('↩️ В меню', 'back_to_menu')
            ]);
            await ctx.reply('Что хотите сделать дальше?', keyboard);
        }
        catch (error) {
            console.error('Error processing game result:', error);
            await ctx.reply('❌ Произошла ошибка при обработке игры. Попробуйте позже.');
        }
    }
    async showAdminPanel(ctx) {
        const keyboard = telegraf_1.Markup.keyboard([
            ['📊 Статистика', '📢 Рассылка'],
            ['📋 Заявки на вывод', '👥 Топ пользователей'],
            ['↩️ Главное меню']
        ]).resize();
        await ctx.reply('👨‍💻 АДМИН ПАНЕЛЬ\n\n' +
            'Выберите действие:', keyboard);
        // Обработка админ команд
        this.setupAdminHandlers();
    }
    setupAdminHandlers() {
        // Статистика
        this.bot.hears('📊 Статистика', async (ctx) => {
            const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
            const withdrawalRepo = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const totalUsers = await userRepo.count();
            const totalStars = await userRepo.createQueryBuilder('user')
                .select('SUM(user.stars)', 'total')
                .getRawOne();
            const pendingWithdrawals = await withdrawalRepo.count({
                where: { status: 'pending' }
            });
            await ctx.reply('📊 СТАТИСТИКА БОТА\n\n' +
                `👥 Всего пользователей: ${totalUsers}\n` +
                `⭐ Всего звезд в системе: ${parseInt(totalStars.total) || 0}\n` +
                `⏳ Заявок на вывод: ${pendingWithdrawals}`);
        });
        // Рассылка
        this.bot.hears('📢 Рассылка', async (ctx) => {
            await ctx.reply('📢 РАССЫЛКА СООБЩЕНИЙ\n\n' +
                'Отправьте сообщение для рассылки всем пользователям.\n' +
                'Можно использовать Markdown разметку.\n\n' +
                'Для отмены отправьте /cancel');
            // Ждем сообщение для рассылки
            this.bot.on('text', async (ctx2) => {
                if (ctx2.message.text === '/cancel') {
                    await ctx2.reply('❌ Рассылка отменена');
                    return;
                }
                const message = ctx2.message.text;
                await ctx2.reply('⏳ Начинаю рассылку...');
                const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
                const users = await userRepo.find();
                let success = 0;
                let failed = 0;
                for (const user of users) {
                    try {
                        await ctx2.telegram.sendMessage(user.telegramId, message, {
                            parse_mode: 'Markdown'
                        });
                        success++;
                    }
                    catch (error) {
                        failed++;
                    }
                    // Задержка чтобы не превысить лимиты Telegram
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                await ctx2.reply(`✅ Рассылка завершена:\n\n` +
                    `✅ Успешно: ${success} пользователей\n` +
                    `❌ Не удалось: ${failed} пользователей`);
            });
        });
        // Заявки на вывод
        this.bot.hears('📋 Заявки на вывод', async (ctx) => {
            const withdrawalRepo = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
            const pendingWithdrawals = await withdrawalRepo.find({
                where: { status: 'pending' },
                relations: ['user'],
                order: { createdAt: 'DESC' }
            });
            if (pendingWithdrawals.length === 0) {
                await ctx.reply('✅ Нет pending заявок на вывод');
                return;
            }
            let message = '📋 ЗАЯВКИ НА ВЫВОД (pending):\n\n';
            for (const withdrawal of pendingWithdrawals) {
                const user = withdrawal.user;
                message +=
                    `🆔 ID заявки: ${withdrawal.id}\n` +
                        `👤 Пользователь: @${user.username || 'Нет username'}\n` +
                        `💰 Сумма: ${withdrawal.amount} звезд\n` +
                        `💳 Кошелек: ${withdrawal.wallet}\n` +
                        `📅 Дата: ${withdrawal.createdAt.toLocaleDateString()}\n` +
                        `---\n`;
            }
            await ctx.reply(message);
        });
        // Топ пользователей
        this.bot.hears('👥 Топ пользователей', async (ctx) => {
            const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
            const topUsers = await userRepo.find({
                order: { stars: 'DESC' },
                take: 10
            });
            let message = '🏆 ТОП-10 ПОЛЬЗОВАТЕЛЕЙ:\n\n';
            topUsers.forEach((user, index) => {
                message +=
                    `${index + 1}. @${user.username || 'Аноним'}\n` +
                        `   ⭐ Звезд: ${user.stars}\n` +
                        `   👥 Рефералов: ${user.referralsCount}\n` +
                        `   💎 Всего заработано: ${user.totalEarned}\n` +
                        `---\n`;
            });
            await ctx.reply(message);
        });
        // Главное меню
        this.bot.hears('↩️ Главное меню', async (ctx) => {
            await this.showMainMenu(ctx);
        });
    }
    launch() {
        this.bot.launch();
        console.log('Bot is running...');
        // Включаем graceful stop
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}
// Запуск бота
const bot = new StarBot();
bot.launch();
