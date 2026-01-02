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
const Captcha_1 = require("./entities/Captcha");
dotenv.config();
class StarBot {
    async scheduleSheetsUpdate(user) {
        const userId = user.telegramId;
        // Отменяем предыдущий таймаут для этого пользователя
        if (this.sheetsUpdateTimeouts.has(userId)) {
            clearTimeout(this.sheetsUpdateTimeouts.get(userId));
        }
        // Устанавливаем новый таймаут
        const timeout = setTimeout(async () => {
            try {
                if (this.googleSheets) {
                    await this.googleSheets.updateUserInSheets(user);
                    console.log(`✅ Отложенное обновление для пользователя ${userId}`);
                }
            }
            catch (error) {
                console.error(`❌ Ошибка отложенного обновления для ${userId}:`, error);
            }
            finally {
                this.sheetsUpdateTimeouts.delete(userId);
            }
        }, this.SHEETS_UPDATE_DELAY);
        this.sheetsUpdateTimeouts.set(userId, timeout);
    }
    async checkAndSetGameLock(ctx) {
        const userId = ctx.from.id;
        const now = Date.now();
        // 1. Проверка debounce (быстрое нажатие)
        const lastPress = this.lastButtonPress.get(userId);
        if (lastPress && (now - lastPress) < this.DEBOUNCE_TIME) {
            console.log(`🚫 User ${userId} clicking too fast (debounce)`);
            try {
                await ctx.answerCbQuery('⏳ Не так быстро!');
            }
            catch (e) {
                // Игнорируем
            }
            return false;
        }
        // 2. Проверка активной игры
        const gameStartTime = this.activeGames.get(userId);
        if (gameStartTime) {
            const timeInGame = now - gameStartTime;
            if (timeInGame < this.GAME_TIMEOUT) {
                console.log(`🚫 User ${userId} already in game (${timeInGame}ms)`);
                try {
                    await ctx.answerCbQuery('🎮 Вы уже в игре!');
                }
                catch (e) {
                    // Игнорируем
                }
                return false;
            }
            else {
                // Игра висит дольше таймаута - очищаем
                console.log(`🧹 Clearing stale game for user ${userId}`);
                this.activeGames.delete(userId);
            }
        }
        // 3. Устанавливаем блокировки
        this.lastButtonPress.set(userId, now);
        this.activeGames.set(userId, now);
        console.log(`🔒 Game lock set for user ${userId}`);
        return true;
    }
    releaseGameLock(userId) {
        this.activeGames.delete(userId);
        console.log(`🔓 Game lock released for user ${userId}`);
        // Автоматически очищаем через таймаут на всякий случай
        setTimeout(() => {
            if (this.activeGames.has(userId)) {
                console.log(`🧹 Auto-clearing game lock for user ${userId}`);
                this.activeGames.delete(userId);
            }
        }, this.GAME_TIMEOUT + 5000); // +5 секунд запаса
    }
    async withGameLock(ctx, gameCallback, betAmount) {
        const userId = ctx.from.id;
        // Проверка баланса если есть ставка
        if (betAmount !== undefined) {
            const hasBalance = await this.checkBalanceBeforeGame(ctx, betAmount);
            if (!hasBalance) {
                return;
            }
        }
        const canPlay = await this.checkAndSetGameLock(ctx);
        if (!canPlay) {
            return;
        }
        try {
            // Отвечаем на callback query
            await ctx.answerCbQuery('🎮 Запускаем игру...');
            // Запускаем игру
            await gameCallback();
        }
        catch (error) {
            console.error(`❌ Game error for user ${userId}:`, error);
            // Показываем ошибку
            try {
                await ctx.answerCbQuery('❌ Ошибка в игре');
                if (ctx.callbackQuery?.message) {
                    await ctx.reply('❌ Произошла ошибка во время игры');
                }
            }
            catch (e) {
                // Игнорируем
            }
            throw error;
        }
        finally {
            // Гарантированно снимаем блокировку
            this.releaseGameLock(userId);
        }
    }
    async setupBotCommands() {
        try {
            const commands = [
                { command: 'start', description: '🚀 Запустить бота' },
                { command: 'games', description: '🎮 Все игры' },
                { command: 'balance', description: '💰 Мой баланс' },
                { command: 'withdraw', description: '💳 Вывод средств' }, // ← Добавлено
                { command: 'referral', description: '👥 Звёзды за друзей' },
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
        this.captchaStore = new Map();
        this.MIN_REFERRALS_FOR_WITHDRAWAL = 5;
        this.GUESS_GAME_BET = 5; // Ставка для игры
        this.activeGames = new Map();
        this.lastButtonPress = new Map();
        this.GAME_TIMEOUT = 10000; // 10 секунд максимум на игру
        this.DEBOUNCE_TIME = 1000; // 1 секунда между нажатиями
        this.broadcastStates = new Map();
        this.channels = process.env.CHANNELS?.split(',') || [];
        this.emojis = process.env.EMOJIS?.split(',') || ['⭐', '🌟', '✨', '💫'];
        this.adminId = parseInt(process.env.ADMIN_ID || '0');
        this.sheetsUpdateTimeouts = new Map();
        this.SHEETS_UPDATE_DELAY = 3000; // 3 секунды задержки
        this.bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
        this.initializeDatabase();
        this.adminIds = process.env.ADMIN_IDS
            ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim()))
            : [this.adminId];
        this.setupErrorHandling();
        // СНАЧАЛА настраиваем middleware для получения пользователя
        this.setupMiddlewares();
        this.setupBotCommands();
        setInterval(() => this.cleanupOldLocks(), 60 * 1000);
        // Очистка при старте
        this.cleanupOldLocks();
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
    cleanupOldLocks() {
        const now = Date.now();
        let cleared = 0;
        for (const [userId, startTime] of this.activeGames.entries()) {
            if (now - startTime > this.GAME_TIMEOUT + 30000) { // +30 секунд запаса
                this.activeGames.delete(userId);
                cleared++;
                console.log(`🧹 Cleared old game lock for user ${userId}`);
            }
        }
        if (cleared > 0) {
            console.log(`🧹 Total cleared locks: ${cleared}`);
        }
    }
    async checkBalanceBeforeGame(ctx, betAmount) {
        const user = ctx.user;
        if (user.stars < betAmount) {
            try {
                await ctx.answerCbQuery(`❌ Недостаточно звезд! Нужно: ${betAmount}`);
                // Показываем меню баланса
                const keyboard = {
                    inline_keyboard: [[
                            { text: '💰 Пополнить баланс', callback_data: 'show_balance' },
                            { text: '🎮 Игры', callback_data: 'play_games' }
                        ]]
                };
                if (ctx.callbackQuery?.message) {
                    await ctx.editMessageText(`❌ *Недостаточно звезд!*\n\n` +
                        `💰 Нужно: ${betAmount} ⭐\n` +
                        `⭐ У вас: ${user.stars} ⭐\n\n` +
                        `💡 Получите больше звезд через рефералов или подождите ежедневный бонус!`, { parse_mode: 'Markdown', reply_markup: keyboard });
                }
            }
            catch (e) {
                // Игнорируем
            }
            return false;
        }
        return true;
    }
    setupErrorHandling() {
        // Глобальный обработчик необработанных ошибок
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        });
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
        });
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
            console.log('⏰ Запуск периодических задач Google Sheets...');
            // Каждые 5 минут: проверяем только выплаты ИЗ таблицы
            setInterval(async () => {
                try {
                    console.log('🔍 Проверка выплат из Google Sheets...');
                    const updatedWithdrawals = await this.googleSheets.checkAndUpdateWithdrawals();
                    if (updatedWithdrawals > 0) {
                        console.log(`✅ Обновлено выплат из таблицы: ${updatedWithdrawals}`);
                    }
                }
                catch (error) {
                    console.error('❌ Ошибка проверки выплат:', error);
                }
            }, 5 * 60 * 1000); // 5 минут
            setInterval(async () => {
                try {
                    console.log('👥 Обновление таблицы рефералов...');
                    const referralCount = await this.googleSheets.syncReferralSystem();
                    console.log(`✅ Таблица рефералов обновлена: ${referralCount} записей`);
                }
                catch (error) {
                    console.error('❌ Ошибка обновления таблицы рефералов:', error);
                }
            }, 5 * 60 * 1000); // 5 минут
            // Каждый час: добавляем новые данные В таблицу (но НЕ обновляем балансы обратно)
            setInterval(async () => {
                try {
                    console.log('🔄 Ежечасная синхронизация с Google Sheets...');
                    await this.googleSheets.syncNewWithdrawalsOnly();
                    await this.googleSheets.syncNewUsersOnly(); // Только НОВЫЕ пользователи
                    console.log('✅ Ежечасная синхронизация завершена');
                }
                catch (error) {
                    console.error('❌ Ошибка ежечасной синхронизации:', error);
                }
            }, 60 * 60 * 1000); // 1 час
            // Каждые 24 часа: полная синхронизация ТОЛЬКО из БД в таблицу
            setInterval(async () => {
                try {
                    console.log('📊 Ежедневная полная синхронизация...');
                    // Только односторонняя: БД → Google Sheets
                    await this.googleSheets.fullSyncToSheets();
                    console.log('✅ Ежедневная синхронизация завершена');
                }
                catch (error) {
                    console.error('❌ Ошибка ежедневной синхронизации:', error);
                }
            }, 24 * 60 * 60 * 1000); // 24 часа
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
            global.broadcastMessage = false;
            global.broadcastAdminId = false;
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
            global.broadcastMessage = false;
            global.broadcastAdminId = false;
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
            console.log(`🚀 Start command from user ${userId}, completedInitialSetup: ${user.completedInitialSetup}`);
            // Обработка реферальной ссылки ДО проверки setup
            const args = ctx.message.text.split(' ');
            if (args.length > 1) {
                const referrerId = parseInt(args[1]);
                console.log(`🔗 Referral detected: referrerId=${referrerId}, currentUserId=${userId}`);
                // Проверяем что это не самоприсваивание
                if (!user.referrerId && referrerId && referrerId !== userId) {
                    console.log(`✅ Setting referrer ${referrerId} for user ${userId}`);
                    // Проверяем существование реферера
                    const referrerRepository = data_source_1.AppDataSource.getRepository(User_1.User);
                    const referrer = await referrerRepository.findOne({
                        where: { telegramId: referrerId }
                    });
                    if (referrer) {
                        user.referrerId = referrer.id; // Сохраняем ID реферера из БД
                        await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
                        console.log(`✅ Referrer ${referrerId} saved for user ${userId}`);
                    }
                    else {
                        console.log(`❌ Referrer ${referrerId} not found in database`);
                    }
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
        this.bot.command('my_withdrawals', async (ctx) => {
            await this.showUserWithdrawals(ctx);
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
        this.bot.action('show_balance', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showUserBalance(ctx);
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
        this.bot.action('show_my_withdrawals', async (ctx) => {
            await ctx.answerCbQuery();
            await this.showUserWithdrawals(ctx);
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
        this.bot.command('check_ref', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав!');
                return;
            }
            const user = ctx.user;
            await ctx.reply(`🔍 *Информация о рефералах:*\n\n` +
                `👤 Ваш ID: ${user.id}\n` +
                `🆔 Telegram ID: ${user.telegramId}\n` +
                `👥 Рефералов: ${user.referralsCount}\n` +
                `🔗 ID реферера: ${user.referrerId || 'Нет'}\n` +
                `⭐ Звезд с рефералов: ${(user.referralsCount || 0) * 5}`, { parse_mode: 'Markdown' });
        });
        this.bot.command('referral', async (ctx) => {
            const user = ctx.user;
            const referralLink = `https://t.me/${ctx.botInfo.username}?start=${user.telegramId}`;
            const earnedFromReferrals = (user.referralsCount || 0) * 5;
            await ctx.reply(`👥 *Реферальная система*\n` +
                `═══════════════════\n` +
                `🎯 Ваша реферальная ссылка:\n` +
                `${referralLink}\n\n` +
                `📊 Статистика:\n` +
                `• Приглашено: ${user.referralsCount || 0}\n` +
                `• Заработано: ${earnedFromReferrals} ⭐\n\n` +
                `💰 *Награды:*\n` +
                `• Вы: +5⭐ за каждого друга\n` +
                `• Друг: +10⭐ при регистрации\n` +
                `═══════════════════`, { parse_mode: 'Markdown' });
        });
        // 2. Обработчики игр (единый обработчик для всех игр)
        this.bot.action(/^play_animated_(.+)$/, async (ctx) => {
            const gameType = ctx.match[1];
            const gameConfig = {
                'slots': { bet: 10, method: this.playAnimatedSlots.bind(this) },
                'dice': { bet: 3, method: this.playAnimatedDice.bind(this) },
                'darts': { bet: 4, method: this.playAnimatedDarts.bind(this) },
                'basketball': { bet: 5, method: this.playAnimatedBasketball.bind(this) },
                'football': { bet: 5, method: this.playAnimatedFootball.bind(this) },
                'bowling': { bet: 6, method: this.playAnimatedBowling.bind(this) },
                'guess': { bet: this.GUESS_GAME_BET, method: this.playGuessGame.bind(this) } // ← НОВАЯ ИГРА
            };
            const config = gameConfig[gameType];
            if (config) {
                if (gameType === 'guess') {
                    // Для угадайки сначала показываем меню выбора числа
                    await this.showGuessNumberMenu(ctx);
                }
                else {
                    // Используем обертку с блокировкой
                    await this.withGameLock(ctx, async () => {
                        await config.method(ctx, config.bet);
                    }, config.bet);
                }
            }
        });
        // Обработчик "Играть снова"
        this.bot.action('play_again', async (ctx) => {
            await this.withGameLock(ctx, async () => {
                await this.showGamesMenu(ctx);
            });
        });
        // Обработчик "Другая игра"
        this.bot.action('other_game', async (ctx) => {
            await this.withGameLock(ctx, async () => {
                await this.showGamesMenu(ctx);
            });
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
            try {
                const userId = parseInt(ctx.match[1]);
                const user = await this.getUser(userId);
                console.log(`🔍 Проверка подписки для пользователя ${userId}`);
                const isSubscribed = await this.checkAllSubscriptions(userId);
                if (isSubscribed) {
                    if (user.completedInitialSetup) {
                        await ctx.answerCbQuery('✅ Вы уже завершили регистрацию');
                        await this.showMainMenu(ctx);
                        return;
                    }
                    user.subscribedToChannels = true;
                    await data_source_1.AppDataSource.getRepository(User_1.User).save(user);
                    await ctx.answerCbQuery('✅ Подписка подтверждена!');
                    // Удаляем старое сообщение если есть
                    try {
                        if (ctx.callbackQuery?.message) {
                            await ctx.deleteMessage();
                        }
                    }
                    catch (e) {
                        // Игнорируем ошибку удаления
                    }
                    // Показываем капчу
                    await this.showEmojiCaptcha(ctx);
                }
                else {
                    await ctx.answerCbQuery('❌ Вы не подписались на все каналы');
                }
            }
            catch (error) {
                console.error('❌ Error in check_subscription handler:', error);
                // Обработка устаревших callback query
                if (error.response?.description?.includes('too old') ||
                    error.response?.description?.includes('query ID is invalid')) {
                    console.log('⚠️ Callback query устарел, игнорируем');
                    return;
                }
                try {
                    await ctx.answerCbQuery('❌ Ошибка при проверке подписки');
                }
                catch (e) {
                    // Игнорируем если не можем ответить
                }
            }
        });
        this.bot.action(/^captcha_emoji_(\d+)_(\d+)$/, async (ctx) => {
            const captchaId = parseInt(ctx.match[1]);
            const selectedIndex = parseInt(ctx.match[2]);
            await this.handleEmojiCaptchaSelection(ctx, captchaId, selectedIndex);
        });
        // Обработчик для обновления капчи
        this.bot.action(/^refresh_captcha_(\d+)$/, async (ctx) => {
            const captchaId = parseInt(ctx.match[1]);
            // Удаляем старую капчу
            const captchaRepository = data_source_1.AppDataSource.getRepository(Captcha_1.Captcha);
            await captchaRepository.delete({ id: captchaId });
            await ctx.answerCbQuery('🔄 Загружаем новую капчу...');
            await this.showEmojiCaptcha(ctx);
        });
        // Обработчик для отмены капчи
        this.bot.action('cancel_captcha', async (ctx) => {
            await ctx.answerCbQuery('❌ Регистрация отменена');
            try {
                if (ctx.callbackQuery?.message) {
                    await ctx.deleteMessage();
                }
            }
            catch (e) {
                // Игнорируем ошибку удаления
            }
            await ctx.reply('❌ Регистрация не завершена.\n' +
                'Если хотите попробовать снова, используйте /start', { parse_mode: 'Markdown' });
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
        this.bot.action(/^guess_number_(\d+)$/, async (ctx) => {
            const chosenNumber = parseInt(ctx.match[1]);
            // Используем обертку с блокировкой
            await this.withGameLock(ctx, async () => {
                await this.playGuessGame(ctx, chosenNumber);
            }, this.GUESS_GAME_BET);
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
    async showGuessNumberMenu(ctx) {
        try {
            const user = ctx.user;
            const betAmount = this.GUESS_GAME_BET;
            // Проверка баланса
            if (user.stars < betAmount) {
                await ctx.answerCbQuery(`❌ Недостаточно звезд! Нужно: ${betAmount}`);
                const keyboard = {
                    inline_keyboard: [[
                            { text: '💰 Пополнить баланс', callback_data: 'show_balance' },
                            { text: '🎮 Игры', callback_data: 'play_games' }
                        ]]
                };
                if (ctx.callbackQuery?.message) {
                    await ctx.editMessageText(`❌ *Недостаточно звезд!*\n\n` +
                        `💰 Ставка: ${betAmount} ⭐\n` +
                        `⭐ У вас: ${user.stars} ⭐\n\n` +
                        `💡 Получите больше звезд через рефералов!`, { parse_mode: 'Markdown', reply_markup: keyboard });
                }
                return;
            }
            const menuText = `🎲 *УГАДАЙ ЧИСЛО*\n` +
                `═══════════════════\n` +
                `💰 Ставка: ${betAmount} ⭐\n` +
                `⭐ Баланс: ${user.stars} ⭐\n` +
                `═══════════════════\n` +
                `🎯 Угадайте число от 1 до 6\n` +
                `🎁 Выигрыш: x3 ставки\n` +
                `═══════════════════\n` +
                `Выберите число:`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '1 ⚀', callback_data: 'guess_number_1' },
                        { text: '2 ⚁', callback_data: 'guess_number_2' },
                        { text: '3 ⚂', callback_data: 'guess_number_3' }
                    ],
                    [
                        { text: '4 ⚃', callback_data: 'guess_number_4' },
                        { text: '5 ⚄', callback_data: 'guess_number_5' },
                        { text: '6 ⚅', callback_data: 'guess_number_6' }
                    ],
                    [
                        { text: '⬅️ Назад к играм', callback_data: 'back_to_games' }
                    ]
                ]
            };
            if (ctx.callbackQuery) {
                await ctx.editMessageText(menuText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                await ctx.answerCbQuery();
            }
            else {
                await ctx.reply(menuText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        }
        catch (error) {
            console.error('❌ Error in showGuessNumberMenu:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке игры');
        }
    }
    async showUserWithdrawals(ctx) {
        try {
            const user = ctx.user;
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            // Получаем все заявки пользователя
            const withdrawals = await withdrawalRepository.find({
                where: { userId: user.id },
                order: { createdAt: 'DESC' },
                take: 20 // Ограничиваем последними 20 заявками
            });
            if (withdrawals.length === 0) {
                await ctx.reply('📭 *У вас пока нет заявок на вывод*\n\n' +
                    'Чтобы создать первую заявку:\n' +
                    '1. Нажмите "💰 Вывод средств"\n' +
                    '2. Выберите сумму\n' +
                    '3. Дождитесь обработки администратором\n\n' +
                    'Минимальная сумма вывода: 100 ⭐', { parse_mode: 'Markdown' });
                return;
            }
            // Группируем заявки по статусу (только 3 статуса)
            const pending = withdrawals.filter(w => w.status === 'pending');
            const approved = withdrawals.filter(w => w.status === 'approved');
            const rejected = withdrawals.filter(w => w.status === 'rejected');
            // Статистика
            const totalAmount = withdrawals.reduce((sum, w) => sum + w.amount, 0);
            const pendingAmount = pending.reduce((sum, w) => sum + w.amount, 0);
            const approvedAmount = approved.reduce((sum, w) => sum + w.amount, 0);
            const rejectedAmount = rejected.reduce((sum, w) => sum + w.amount, 0);
            let message = `📋 *Ваши заявки на вывод*\n\n`;
            // Общая статистика
            message += `📊 *Статистика:*\n`;
            message += `• Всего заявок: ${withdrawals.length}\n`;
            message += `• Общая сумма: ${totalAmount} ⭐\n\n`;
            // По статусам
            message += `⏳ *В ожидании (${pending.length}):*\n`;
            if (pending.length > 0) {
                pending.forEach((w, index) => {
                    const date = w.createdAt.toLocaleDateString('ru-RU');
                    const time = w.createdAt.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    message += `  ${index + 1}. #${w.id} - ${w.amount}⭐ (${date} ${time})\n`;
                });
            }
            else {
                message += `  Нет заявок\n`;
            }
            message += `  Всего в ожидании: ${pendingAmount} ⭐\n\n`;
            message += `✅ *Одобренные (${approved.length}):*\n`;
            if (approved.length > 0) {
                approved.forEach((w, index) => {
                    const date = w.processedAt
                        ? new Date(w.processedAt).toLocaleDateString('ru-RU')
                        : 'в обработке';
                    const time = w.processedAt
                        ? new Date(w.processedAt).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })
                        : '';
                    message += `  ${index + 1}. #${w.id} - ${w.amount}⭐ (${date}${time ? ' ' + time : ''})\n`;
                });
            }
            else {
                message += `  Нет заявок\n`;
            }
            message += `  Всего одобрено: ${approvedAmount} ⭐\n\n`;
            message += `❌ *Отклоненные (${rejected.length}):*\n`;
            if (rejected.length > 0) {
                rejected.forEach((w, index) => {
                    const date = w.processedAt
                        ? new Date(w.processedAt).toLocaleDateString('ru-RU')
                        : '-';
                    const time = w.processedAt
                        ? new Date(w.processedAt).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit'
                        })
                        : '';
                    message += `  ${index + 1}. #${w.id} - ${w.amount}⭐ (${date}${time ? ' ' + time : ''})\n`;
                });
            }
            else {
                message += `  Нет заявок\n`;
            }
            message += `  Всего отклонено: ${rejectedAmount} ⭐\n\n`;
            // Последние 5 заявок подробно
            message += `────────────────────\n`;
            message += `📝 *Последние 5 заявок:*\n\n`;
            const recentWithdrawals = withdrawals.slice(0, 5);
            recentWithdrawals.forEach((withdrawal, index) => {
                const statusEmoji = {
                    'pending': '⏳',
                    'approved': '✅',
                    'rejected': '❌'
                }[withdrawal.status] || '❓';
                const statusText = {
                    'pending': 'В ожидании',
                    'approved': 'Одобрена',
                    'rejected': 'Отклонена'
                }[withdrawal.status] || withdrawal.status;
                const date = withdrawal.createdAt.toLocaleDateString('ru-RU');
                const time = withdrawal.createdAt.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                message += `${statusEmoji} *Заявка #${withdrawal.id}*\n`;
                message += `Сумма: ${withdrawal.amount} ⭐\n`;
                message += `Статус: ${statusText}\n`;
                message += `Дата создания: ${date} ${time}\n`;
                if (withdrawal.processedAt) {
                    const processedDate = new Date(withdrawal.processedAt).toLocaleDateString('ru-RU');
                    const processedTime = new Date(withdrawal.processedAt).toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    message += `Обработана: ${processedDate} ${processedTime}\n`;
                }
                message += `────────────────────\n`;
            });
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '💰 Создать заявку', callback_data: 'withdraw' },
                        { text: '📊 Баланс', callback_data: 'show_balance' }
                    ],
                    [
                        { text: '🏠 В меню', callback_data: 'back_to_menu' }
                    ]
                ]
            };
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
        catch (error) {
            console.error('❌ Error showing user withdrawals:', error);
            await ctx.reply('❌ Ошибка при загрузке заявок. Попробуйте позже.');
        }
    }
    async showUserBalance(ctx) {
        try {
            const user = ctx.user;
            // Получаем актуальные данные
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const currentUser = await userRepository.findOne({
                where: { id: user.id },
                select: ['stars', 'referralsCount', 'totalEarned']
            });
            if (!currentUser) {
                await ctx.reply('❌ Ошибка загрузки баланса');
                return;
            }
            const userStars = currentUser.stars;
            const referralsCount = currentUser.referralsCount || 0;
            const totalEarned = currentUser.totalEarned || 0;
            // Получаем статистику выплат
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const withdrawals = await withdrawalRepository.find({
                where: { userId: user.id }
            });
            const totalWithdrawn = withdrawals
                .filter(w => w.status === 'approved')
                .reduce((sum, w) => sum + w.amount, 0);
            const pendingWithdrawn = withdrawals
                .filter(w => w.status === 'pending')
                .reduce((sum, w) => sum + w.amount, 0);
            // Проверяем достаточно ли рефералов для вывода
            const hasEnoughReferrals = referralsCount >= this.MIN_REFERRALS_FOR_WITHDRAWAL;
            const neededReferrals = this.MIN_REFERRALS_FOR_WITHDRAWAL - referralsCount;
            let message = `💰 *Ваш баланс*\n\n` +
                `⭐ Звезды: ${userStars}\n` +
                `💰 Всего заработано: ${totalEarned}\n` +
                `👥 Рефералов: ${referralsCount} из ${this.MIN_REFERRALS_FOR_WITHDRAWAL}\n`;
            if (!hasEnoughReferrals) {
                message += `⚠️ *Для вывода пригласите еще ${neededReferrals} ${this.getReferralWord(neededReferrals)}*\n\n`;
            }
            else {
                message += `✅ *Достаточно рефералов для вывода*\n\n`;
            }
            message += `📊 *Статистика выплат:*\n` +
                `• Одобрено к выплате: ${totalWithdrawn} ⭐\n` +
                `• В ожидании вывода: ${pendingWithdrawn} ⭐\n` +
                `• Всего заявок: ${withdrawals.length}\n\n` +
                `💳 *Минимальный вывод:* 100 ⭐`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 Мои заявки', callback_data: 'show_my_withdrawals' },
                        { text: '💰 Вывод', callback_data: 'withdraw' }
                    ],
                    [
                        { text: '👥 Пригласить друзей', callback_data: 'show_referrals' }
                    ],
                    [
                        { text: '🏠 В меню', callback_data: 'back_to_menu' }
                    ]
                ]
            };
            if (ctx.callbackQuery) {
                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
            else {
                await ctx.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        }
        catch (error) {
            console.error('❌ Error showing user balance:', error);
            await ctx.reply('❌ Ошибка при загрузке баланса.');
        }
    }
    setupMiddlewares() {
        // Middleware для получения пользователя
        this.bot.use(async (ctx, next) => {
            try {
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
            }
            catch (error) {
                console.error(`❌ Middleware error for user ${ctx.from?.id}:`, error.message);
                // Отправляем сообщение об ошибке пользователю
                try {
                    await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте еще раз через несколько секунд.');
                }
                catch (e) {
                    // Игнорируем если не можем отправить сообщение
                }
            }
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
                `👥 Звёзды за друзей - Пригласить друзей\n` +
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
                `• 🎲 Угадайка - 5⭐ (угадай число 1-6, выигрыш x2)\n` +
                `═══════════════════\n` +
                `💰 *Реферальная система:*\n` +
                `• Вы получаете 5⭐ за каждого друга\n` +
                `• Друг получает 10⭐ при регистрации\n` +
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
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 100; // ms
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
                // Пытаемся найти пользователя
                let user = await userRepository.findOne({
                    where: { telegramId },
                    select: [
                        'id', 'telegramId', 'username', 'firstName', 'lastName',
                        'stars', 'totalEarned', 'selectedEmoji', 'subscribedToChannels',
                        'completedInitialSetup', 'referrerId', 'referralsCount', 'status'
                    ]
                });
                if (!user) {
                    console.log(`🆕 [Attempt ${attempt}] Creating new user with Telegram ID: ${telegramId}`);
                    // Создаем нового пользователя с защитой от дублирования
                    user = userRepository.create({
                        telegramId,
                        username: from?.username || null,
                        firstName: from?.first_name || null,
                        lastName: from?.last_name || null,
                        stars: 0,
                        totalEarned: 0,
                        referralsCount: 0,
                        status: 'active',
                        completedInitialSetup: false,
                        subscribedToChannels: false,
                    });
                    try {
                        await userRepository.save(user);
                        console.log(`✅ User created successfully: ID ${user.id}, Telegram ID ${telegramId}`);
                    }
                    catch (saveError) {
                        // Если ошибка уникальности - значит пользователь уже создан другим процессом
                        if (saveError.code === '23505' || saveError.message?.includes('users_telegramId_key')) {
                            console.log(`⚠️ User ${telegramId} already exists (race condition), retrying...`);
                            // Ждем немного и пытаемся найти пользователя снова
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                            user = await userRepository.findOne({
                                where: { telegramId }
                            });
                            if (user) {
                                console.log(`✅ Found existing user after race condition: ID ${user.id}`);
                                return user;
                            }
                            // Продолжаем цикл
                            continue;
                        }
                        // Другие ошибки - выбрасываем
                        throw saveError;
                    }
                }
                return user;
            }
            catch (error) {
                console.error(`❌ [Attempt ${attempt}] Error getting user ${telegramId}:`, error.message);
                if (attempt === MAX_RETRIES) {
                    console.error(`❌ Failed to get user ${telegramId} after ${MAX_RETRIES} attempts`);
                    throw error;
                }
                // Ждем перед следующей попыткой
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
            }
        }
        throw new Error(`Failed to get or create user ${telegramId}`);
    }
    async showChannelsToSubscribe(ctx) {
        const channels = this.channels;
        const buttons = [];
        // Создаем кнопки для каждого канала
        for (const channel of channels) {
            const urlButton = telegraf_1.Markup.button.url(`📢 Подписаться на ${channel}`, `https://t.me/${channel.replace('@', '')}`);
            buttons.push([urlButton]);
        }
        // Кнопка проверки
        const checkButton = telegraf_1.Markup.button.callback('✅ Я подписался на все каналы', `check_subscription_${ctx.from.id}`);
        buttons.push([checkButton]);
        await ctx.reply('🎯 Добро пожаловать! Для начала работы необходимо подписаться на наши каналы:\n\n' +
            channels.map(c => `• ${c}`).join('\n') + '\n\n' +
            'После подписки нажмите кнопку проверки ⬇️', telegraf_1.Markup.inlineKeyboard(buttons));
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
    async showMainMenu(ctx) {
        try {
            const user = ctx.user;
            // ОБНОВЛЯЕМ пользователя из БД, чтобы получить актуальные данные
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const updatedUser = await userRepository.findOne({
                where: { id: user.id },
                select: ['stars', 'referralsCount', 'firstName']
            });
            // Если нашли обновленного пользователя, используем его данные
            const currentStars = updatedUser?.stars || user.stars;
            const currentReferrals = updatedUser?.referralsCount || user.referralsCount;
            const currentFirstName = updatedUser?.firstName || user.firstName;
            const menuText = `🎮 *Главное меню*\n` +
                `═══════════════════\n` +
                `👤 Имя: ${currentFirstName || 'Аноним'}\n` +
                `⭐ Баланс: ${currentStars} ⭐\n` +
                `👥 Рефералов: ${currentReferrals || 0}\n` +
                `═══════════════════`;
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('🎮 Играть', 'play_games'),
                    telegraf_1.Markup.button.callback('👥 Звёзды за друзей', 'show_referrals')
                ],
                [
                    telegraf_1.Markup.button.callback('💰 Вывод средств', 'withdraw'),
                    telegraf_1.Markup.button.callback('📋 Мои заявки', 'show_my_withdrawals') // ← НОВАЯ КНОПКА
                ],
                [
                    telegraf_1.Markup.button.callback('❓ Помощь', 'show_help')
                ]
            ]);
            // ВАЖНО: Если это callbackQuery и мы удалили сообщение, отправляем новое
            if (ctx.callbackQuery) {
                try {
                    await ctx.editMessageText(menuText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                }
                catch (editError) {
                    // Если нельзя отредактировать (сообщение удалено), отправляем новое
                    console.log('⚠️ Cannot edit message, sending new one');
                    await ctx.reply(menuText, {
                        parse_mode: 'Markdown',
                        ...keyboard
                    });
                }
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
            // Всегда отправляем новое сообщение при ошибке
            try {
                await ctx.reply('🎮 *Главное меню*\n\nНажмите на кнопки ниже:', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '🎮 Играть', callback_data: 'play_games' },
                                { text: '👥 Звёзды за друзей', callback_data: 'show_referrals' }
                            ],
                            [
                                { text: '💰 Вывод средств', callback_data: 'withdraw' }
                            ],
                            [
                                { text: '❓ Помощь', callback_data: 'show_help' }
                            ]
                        ]
                    }
                });
            }
            catch (finalError) {
                console.error('❌ Fatal error in showMainMenu:', finalError);
            }
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
                    telegraf_1.Markup.button.callback('🎲 Угадайка (5⭐)', 'play_animated_guess'), // ← НОВАЯ ИГРА
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
            // Получаем актуальные данные
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const currentUser = await userRepository.findOne({
                where: { id: user.id },
                select: ['referralsCount']
            });
            const referralsCount = currentUser?.referralsCount || 0;
            const earnedFromReferrals = referralsCount * 3;
            // Проверяем достаточно ли рефералов для вывода
            const hasEnoughReferrals = referralsCount >= this.MIN_REFERRALS_FOR_WITHDRAWAL;
            const neededReferrals = this.MIN_REFERRALS_FOR_WITHDRAWAL - referralsCount;
            let menuText = `👥 *Реферальная система*\n` +
                `═══════════════════\n` +
                `🎯 Ваша реферальная ссылка:\n` +
                `\`${referralLink}\`\n\n` +
                `📊 Статистика:\n` +
                `• Приглашено: ${referralsCount}\n` +
                `• Заработано: ${earnedFromReferrals} ⭐\n\n`;
            if (!hasEnoughReferrals) {
                menuText += `⚠️ *Для вывода средств необходимо:*\n` +
                    `• Пригласить еще ${neededReferrals} ${this.getReferralWord(neededReferrals)}\n` +
                    `• Всего должно быть: ${this.MIN_REFERRALS_FOR_WITHDRAWAL}\n\n`;
            }
            else {
                menuText += `✅ *Достаточно рефералов для вывода!*\n\n`;
            }
            menuText += `💰 *Награды:*\n` +
                `• Вы: +5⭐ за каждого друга\n` +
                `• Друг: +10⭐ при регистрации\n` +
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
                `4. Друг получит 10⭐ за регистрацию`, { parse_mode: 'Markdown' });
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
                `👉 *Регистрируйся по моей ссылке и получи 10⭐ бонуса:*\n` +
                `${referralLink}\n\n` +
                `🎁 *Бонусы:*\n` +
                `• Ты получишь 10⭐ при регистрации\n` +
                `• Я получу 5⭐ за твое приглашение`;
            await ctx.reply(shareText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                            {
                                text: '🔗 Переслать друзьям',
                                switch_inline_query: `Присоединяйся к игре! Регистрируйся и получи 10⭐: ${referralLink}`
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
        console.log('🚀 Начало обработки вывода');
        try {
            const user = ctx.user;
            const minWithdraw = 100;
            // 1. Проверка username
            if (!user.username) {
                const message = '❌ *Для вывода средств необходим username в Telegram!*';
                await this.sendErrorMessage(ctx, message, 'withdraw');
                return;
            }
            // 2. Проверка минимальной суммы
            if (amount < minWithdraw) {
                const message = `❌ Минимальная сумма: ${minWithdraw} ⭐`;
                await this.sendErrorMessage(ctx, message, 'withdraw');
                return;
            }
            // 3. Проверка баланса
            if (user.stars < amount) {
                const message = `❌ Недостаточно средств! Нужно: ${amount} ⭐\nВаш баланс: ${user.stars} ⭐`;
                await this.sendErrorMessage(ctx, message, 'withdraw');
                return;
            }
            // 4. Проверка количества рефералов
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const currentUser = await userRepository.findOne({
                where: { id: user.id },
                select: ['referralsCount']
            });
            const referralsCount = currentUser?.referralsCount || 0;
            if (referralsCount < this.MIN_REFERRALS_FOR_WITHDRAWAL) {
                const needed = this.MIN_REFERRALS_FOR_WITHDRAWAL - referralsCount;
                const message = `❌ *Недостаточно рефералов для вывода!*\n\n` +
                    `📊 *Текущая статистика:*\n` +
                    `• Приглашено друзей: ${referralsCount}\n` +
                    `• Необходимо минимум: ${this.MIN_REFERRALS_FOR_WITHDRAWAL}\n` +
                    `• Не хватает: ${needed} ${this.getReferralWord(needed)}\n\n` +
                    `🎁 *Как пригласить друзей:*\n` +
                    `1. Нажмите "👥 Пригласить друзей"\n` +
                    `2. Поделитесь своей реферальной ссылкой\n` +
                    `3. За каждого друга получаете 5⭐\n` +
                    `4. Друг получает 10⭐ при регистрации\n\n` +
                    `💡 *Пригласите ${needed} ${this.getReferralWord(needed)} и сможете выводить средства!*`;
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👥 Пригласить друзей', callback_data: 'show_referrals' },
                            { text: '📊 Мой профиль', callback_data: 'back_to_menu' }
                        ]
                    ]
                };
                if (ctx.callbackQuery) {
                    await ctx.answerCbQuery('❌ Недостаточно рефералов');
                    try {
                        if (ctx.callbackQuery.message) {
                            await ctx.editMessageText(message, {
                                parse_mode: 'Markdown',
                                reply_markup: keyboard
                            });
                        }
                    }
                    catch (editError) {
                        await ctx.reply(message, {
                            parse_mode: 'Markdown',
                            reply_markup: keyboard
                        });
                    }
                }
                else {
                    await ctx.reply(message, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });
                }
                return;
            }
            // 5. Снимаем средства с баланса пользователя (только если прошли все проверки)
            user.stars -= amount;
            console.log(`💰 Списано ${amount} звезд. Новый баланс пользователя ${user.telegramId}: ${user.stars}`);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                    console.log(`✅ Баланс обновлен в Google Sheets`);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы:', sheetError);
                }
            }
            // 6. Создаем заявку на вывод
            const withdrawal = await this.createWithdrawalRequest(user, amount);
            // 7. Отправляем подтверждение
            const confirmationMessage = `✅ *Заявка на вывод #${withdrawal.id} создана!*\n\n` +
                `💰 *Сумма:* ${amount} ⭐\n` +
                `👥 *Рефералов:* ${referralsCount} (требуется: ${this.MIN_REFERRALS_FOR_WITHDRAWAL})\n` +
                `📊 *Статус:* ожидание обработки администратором\n` +
                `⏰ *Срок:* до 24 часов\n\n` +
                `💡 Вы получите уведомление, когда заявка будет обработана.`;
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(`✅ Заявка #${withdrawal.id} на ${amount}⭐ отправлена!`);
                try {
                    if (ctx.callbackQuery.message) {
                        await ctx.editMessageText(confirmationMessage, {
                            parse_mode: 'Markdown'
                        });
                    }
                }
                catch (editError) {
                    await ctx.reply(confirmationMessage, { parse_mode: 'Markdown' });
                }
            }
            else {
                await ctx.reply(confirmationMessage, { parse_mode: 'Markdown' });
            }
            // 8. Сбрасываем флаг
            ctx.waitingForWithdrawAmount = false;
            // 9. Синхронизируем с Google Sheets
            if (this.googleSheets) {
                try {
                    await this.googleSheets.syncWithdrawalSimple(withdrawal, this.bot);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка синхронизации выплаты:', sheetError);
                }
            }
            // 10. Уведомляем администратора
            await this.notifyAdminAboutWithdrawal(user, amount, withdrawal.id, referralsCount);
        }
        catch (error) {
            console.error('❌ Error processing withdraw:', error);
            // Возвращаем средства если ошибка
            if (ctx.user) {
                ctx.user.stars += amount;
                await data_source_1.AppDataSource.getRepository(User_1.User).save(ctx.user);
                // Обновляем таблицу
                if (this.googleSheets) {
                    try {
                        await this.googleSheets.updateUserInSheets(ctx.user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка возврата баланса в таблицу:', sheetError);
                    }
                }
            }
            const errorMessage = '❌ Ошибка при создании заявки';
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery(errorMessage);
            }
            await ctx.reply('❌ Произошла ошибка при создании заявки. Попробуйте позже.');
        }
    }
    getReferralWord(count) {
        if (count % 10 === 1 && count % 100 !== 11) {
            return 'реферала';
        }
        else if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
            return 'реферала';
        }
        else {
            return 'рефералов';
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
    // Метод для создания заявки в БД
    async createWithdrawalRequest(user, amount) {
        try {
            console.log(`🔍 Creating withdrawal for user ID: ${user.id}, telegramId: ${user.telegramId}`);
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const withdrawal = new Withdrawal_1.Withdrawal();
            withdrawal.userId = user.id; // Используй user.id (число), а не telegramId
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
    async notifyAdminAboutWithdrawal(user, amount, withdrawalId, referralsCount) {
        try {
            if (this.adminId) {
                const message = `📋 *НОВАЯ ЗАЯВКА НА ВЫВОД*\n\n` +
                    `🆔 ID заявки: #${withdrawalId}\n` +
                    `💰 Сумма: ${amount} ⭐\n` +
                    `👤 Пользователь: ${user.firstName || 'Не указано'}\n` +
                    `🆔 User ID: ${user.telegramId}\n` +
                    `👤 Username: @${user.username || 'Не указан'}\n` +
                    `👥 Рефералов: ${referralsCount || user.referralsCount || 0}\n` +
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
            // Получаем актуальные данные пользователя
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const currentUser = await userRepository.findOne({
                where: { id: user.id },
                select: ['stars', 'referralsCount']
            });
            if (!currentUser) {
                await ctx.reply('❌ Ошибка загрузки данных пользователя');
                return;
            }
            const userStars = currentUser.stars;
            const userReferrals = currentUser.referralsCount || 0;
            // Проверяем достаточно ли рефералов
            const hasEnoughReferrals = userReferrals >= this.MIN_REFERRALS_FOR_WITHDRAWAL;
            let menuText = `💰 *Вывод средств*\n` +
                `═══════════════════\n` +
                `⭐ Баланс: ${userStars}\n` +
                `💰 Мин. сумма: ${minWithdraw}\n` +
                `👥 Рефералов: ${userReferrals} из ${this.MIN_REFERRALS_FOR_WITHDRAWAL} необходимых\n`;
            if (!hasEnoughReferrals) {
                menuText += `\n⚠️ *Для вывода необходимо пригласить ${this.MIN_REFERRALS_FOR_WITHDRAWAL} друзей*\n` +
                    `📊 Сейчас: ${userReferrals} из ${this.MIN_REFERRALS_FOR_WITHDRAWAL}\n` +
                    `👥 Не хватает: ${this.MIN_REFERRALS_FOR_WITHDRAWAL - userReferrals}\n` +
                    `═══════════════════\n` +
                    `🎁 За каждого приглашенного друга:\n` +
                    `• Вы получаете 5⭐\n` +
                    `• Друг получает 10⭐\n` +
                    `• Приближаетесь к возможности вывода!`;
            }
            else {
                menuText += `✅ *Достаточно рефералов для вывода*\n` +
                    `═══════════════════`;
            }
            const keyboard = telegraf_1.Markup.inlineKeyboard([
                [
                    telegraf_1.Markup.button.callback('100 ⭐', 'withdraw_100'),
                ],
                [
                    telegraf_1.Markup.button.callback('150 ⭐', 'withdraw_150'),
                    telegraf_1.Markup.button.callback('200 ⭐', 'withdraw_200'),
                ],
                [
                    telegraf_1.Markup.button.callback('500 ⭐', 'withdraw_500'),
                    telegraf_1.Markup.button.callback('Все ⭐', 'withdraw_all')
                ],
                [
                    telegraf_1.Markup.button.callback('👥 Пригласить друзей', 'show_referrals')
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
    async playAnimatedSlots(ctx, betAmount) {
        const userId = ctx.from.id;
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
            // Списываем ставку
            user.stars -= betAmount;
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы:', sheetError);
                }
            }
            // Отправляем анимацию
            const animation = await ctx.replyWithDice({ emoji: '🎰' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const slotValue = animation.dice.value;
            const winResult = this.calculateSlotWin(slotValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await userRepository.save(user);
                // Снова обновляем Google Sheets
                if (this.googleSheets) {
                    try {
                        await this.scheduleSheetsUpdate(user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка обновления таблицы после выигрыша:', sheetError);
                    }
                }
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_slots';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            try {
                await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
                console.log(`💾 Слоты сохранены в БД для пользователя ${userId}: выигрыш ${winAmount}`);
            }
            catch (gameError) {
                console.error('❌ Ошибка сохранения слотов в БД:', gameError);
            }
            // Показываем результат
            await this.showAnimatedGameResult(ctx, user, 'animated_slots', '🎰', slotValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error(`❌ Error in playAnimatedSlots for user ${userId}:`, error);
            // Не выбрасываем ошибку дальше, чтобы withGameLock мог корректно снять блокировку
            // Просто логируем и показываем пользователю ошибку
            try {
                await ctx.reply('❌ Ошибка в игровых автоматах. Попробуйте позже.');
            }
            catch (e) {
                // Игнорируем если не можем отправить
            }
            // Возвращаем управление (не выбрасываем)
            return;
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
            winMultiplier = 5;
            resultText = `🎰`;
        }
        // 🍒 🍒 🍒 (значение 22)
        else if (slotsValue === 22) {
            winMultiplier = 1.5;
            resultText = `🎰`;
        }
        // 🍋 🍋 🍋 (значение 1)
        else if (slotsValue === 1) {
            winMultiplier = 1.5;
            resultText = `🎰`;
        }
        // 🍊 🍊 🍊 (значение 43)
        else if (slotsValue === 43) {
            winMultiplier = 1;
            resultText = `🎰`;
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
    async playGuessGame(ctx, chosenNumber) {
        const userId = ctx.from.id;
        const betAmount = this.GUESS_GAME_BET;
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            console.log(`🎲 Угадайка: пользователь ${userId}, выбрал число ${chosenNumber}, ставка: ${betAmount}`);
            // Проверка баланса (дополнительная, на всякий случай)
            if (user.stars < betAmount) {
                await ctx.answerCbQuery(`❌ Недостаточно звезд! Нужно: ${betAmount}`);
                return;
            }
            // Списываем ставку
            user.stars -= betAmount;
            console.log(`💰 Списано ${betAmount} звезд. Новый баланс: ${user.stars}`);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы после списания:', sheetError);
                }
            }
            // Отправляем анимацию кубика
            const animation = await ctx.replyWithDice({ emoji: '🎲' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const diceValue = animation.dice.value;
            console.log(`🎲 Выпало: ${diceValue}, пользователь выбрал: ${chosenNumber}`);
            // Определяем выигрыш
            let winAmount = 0;
            let resultText = '';
            let isWin = false;
            if (diceValue === chosenNumber) {
                // УГАДАЛ! Выигрыш x3 (как у тебя в коде betAmount * 3)
                winAmount = betAmount * 3;
                isWin = true;
                resultText = `Вы угадали число ${diceValue}`;
                // ВАЖНО: Начисляем выигрыш на баланс пользователя!
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await userRepository.save(user);
                // Обновляем Google Sheets после выигрыша
                if (this.googleSheets) {
                    try {
                        await this.scheduleSheetsUpdate(user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка обновления таблицы после выигрыша:', sheetError);
                    }
                }
                console.log(`💰 Начислен выигрыш ${winAmount} звезд. Новый баланс: ${user.stars}`);
            }
            else {
                // НЕ УГАДАЛ
                isWin = false;
                winAmount = 0; // Проигрыш - 0 звезд
                resultText = `Вы выбрали: ${chosenNumber}\nВыпало: ${diceValue}`;
                // При проигрыше просто сохраняем пользователя с уже списанной ставкой
                await userRepository.save(user);
                console.log(`😔 Проигрыш. Баланс после списания ставки: ${user.stars}`);
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'guess_dice';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = isWin ? 'win' : 'loss';
            try {
                await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
                console.log(`💾 Угадайка сохранена в БД для пользователя ${userId}: ${isWin ? 'выигрыш' : 'проигрыш'} ${winAmount}`);
            }
            catch (gameError) {
                console.error('❌ Ошибка сохранения угадайки в БД:', gameError);
            }
            // Показываем результат
            await this.showGuessGameResult(ctx, user, diceValue, chosenNumber, betAmount, winAmount, resultText, isWin);
        }
        catch (error) {
            console.error(`❌ Error in playGuessGame for user ${userId}:`, error);
            try {
                await ctx.answerCbQuery('❌ Ошибка в игре');
                await ctx.reply('❌ Ошибка в игре "Угадайка". Попробуйте позже.');
            }
            catch (e) {
                // Игнорируем
            }
            return;
        }
    }
    async showGuessGameResult(ctx, user, diceValue, chosenNumber, betAmount, winAmount, resultText, isWin) {
        try {
            const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
            const diceEmoji = diceEmojis[diceValue] || '🎲';
            // Определяем эмодзи результата как в других играх
            let resultEmoji = '';
            let resultTitle = '';
            if (isWin) {
                if (winAmount > betAmount * 1.5) {
                    resultEmoji = '💰';
                    resultTitle = '*БОЛЬШОЙ ВЫИГРЫШ!*';
                }
                else {
                    resultEmoji = '🎉';
                    resultTitle = '*ВЫ ВЫИГРАЛИ!*';
                }
            }
            else {
                resultEmoji = '😔';
                resultTitle = '*Попробуйте еще раз*';
            }
            const message = `🎲 *Угадай число*\n` +
                `═══════════════════\n` +
                `${resultEmoji} ${resultTitle}\n` +
                `Вы выбрали: ${chosenNumber}\n` +
                `Выпало: ${diceValue} ${diceEmoji}\n\n` +
                `💰 *Ставка:* ${betAmount} ⭐\n` +
                `🏆 *Выигрыш:* ${winAmount} ⭐\n` +
                `⭐ *Баланс:* ${user.stars} ⭐\n` +
                `═══════════════════`;
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🎲 Играть еще', callback_data: 'play_animated_guess' },
                        { text: '🎮 Другие игры', callback_data: 'other_game' }
                    ],
                    [
                        { text: '🏠 В меню', callback_data: 'back_to_menu' }
                    ]
                ]
            };
            // Удаляем старое сообщение с меню выбора
            if (ctx.callbackQuery?.message) {
                try {
                    await ctx.deleteMessage();
                }
                catch (deleteError) {
                    console.log('⚠️ Cannot delete message, continuing...');
                }
            }
            // Отправляем результат как новое сообщение
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
        catch (error) {
            console.error('❌ Error showing guess game result:', error);
            // Упрощенный вариант в случае ошибки
            try {
                await ctx.reply(`🎲 *Угадай число*\n\n` +
                    `${isWin ? '🎉 Поздравляем! Вы угадали!' : '😔 Не угадали'}\n` +
                    `Выбрали: ${chosenNumber}, выпало: ${diceValue}\n` +
                    `Выигрыш: ${winAmount} ⭐\n` +
                    `Баланс: ${user.stars} ⭐`, { parse_mode: 'Markdown' });
            }
            catch (e) {
                // Игнорируем
            }
        }
    }
    async playAnimatedDice(ctx, betAmount) {
        const userId = ctx.from.id;
        try {
            let user = ctx.user;
            if (!user) {
                user = await this.getUser(ctx.from.id);
                ctx.user = user;
            }
            console.log(`🎲 Игра в кости: пользователь ${userId}, баланс: ${user.stars}, ставка: ${betAmount}`);
            if (user.stars < betAmount) {
                await ctx.reply(`❌ Недостаточно звезд! Нужно: ${betAmount}, у вас: ${user.stars}`);
                return;
            }
            // Списываем ставку
            user.stars -= betAmount;
            console.log(`💰 Списано ${betAmount} звезд. Новый баланс: ${user.stars}`);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы после списания:', sheetError);
                }
            }
            // Отправляем анимацию
            const animation = await ctx.replyWithDice({ emoji: '🎲' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const diceValue = animation.dice.value;
            console.log(`🎲 Выпало: ${diceValue}`);
            // Рассчитываем выигрыш
            const winResult = this.calculateDiceWin(diceValue, betAmount);
            const { winAmount, resultText } = winResult;
            // Начисляем выигрыш если есть
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await userRepository.save(user);
                // Снова обновляем Google Sheets
                if (this.googleSheets) {
                    try {
                        await this.scheduleSheetsUpdate(user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка обновления таблицы после выигрыша:', sheetError);
                    }
                }
            }
            else {
                // Если проиграл, всё равно сохраняем пользователя для обновления баланса
                await userRepository.save(user);
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_dice';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            try {
                await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
                console.log(`💾 Кости сохранены в БД для пользователя ${userId}: выигрыш ${winAmount}`);
            }
            catch (gameError) {
                console.error('❌ Ошибка сохранения игры в БД:', gameError);
            }
            // Показываем результат
            await this.showAnimatedGameResult(ctx, user, 'animated_dice', '🎲', diceValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error(`❌ Error in playAnimatedDice for user ${userId}:`, error);
            try {
                await ctx.reply('❌ Ошибка в игре в кости. Попробуйте позже.');
            }
            catch (e) {
                // Игнорируем если не можем отправить
            }
            // Возвращаем управление (не выбрасываем)
            return;
        }
    }
    calculateDiceWin(diceValue, betAmount) {
        let winMultiplier = 0;
        const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        const diceEmoji = diceEmojis[diceValue] || '🎲';
        let resultText = '';
        if (diceValue === 6) {
            // Максимальное значение - наибольший выигрыш
            winMultiplier = 2;
            resultText = `🎲 *ШЕСТЕРКА!*! ${diceEmoji}`;
        }
        else if (diceValue === 5) {
            // 5 очков - очень хорошо
            winMultiplier = 1.5;
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
        const userId = ctx.from.id;
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
            // Списываем ставку
            user.stars -= betAmount;
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы:', sheetError);
                }
            }
            // Отправляем анимацию
            const animation = await ctx.replyWithDice({ emoji: '🎯' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const dartsValue = animation.dice.value;
            const winResult = this.calculateDartsWin(dartsValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await userRepository.save(user);
                // Снова обновляем Google Sheets
                if (this.googleSheets) {
                    try {
                        await this.scheduleSheetsUpdate(user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка обновления таблицы после выигрыша:', sheetError);
                    }
                }
            }
            else {
                // Если проиграл, всё равно сохраняем пользователя
                await userRepository.save(user);
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_darts';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            try {
                await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
                console.log(`💾 Дартс сохранены в БД для пользователя ${userId}: выигрыш ${winAmount}`);
            }
            catch (gameError) {
                console.error('❌ Ошибка сохранения дартс в БД:', gameError);
            }
            // Показываем результат
            await this.showAnimatedGameResult(ctx, user, 'animated_darts', '🎯', dartsValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error(`❌ Error in playAnimatedDarts for user ${userId}:`, error);
            try {
                await ctx.reply('❌ Ошибка в игре в дартс. Попробуйте позже.');
            }
            catch (e) {
                // Игнорируем
            }
            return;
        }
    }
    calculateDartsWin(dartsValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (dartsValue === 6) {
            // Яблочко - максимальный выигрыш
            winMultiplier = 2; // можно увеличить до 10, если хотите больше награды
            resultText = `🎯 *В ЯБЛОЧКО!*!`;
        }
        else if (dartsValue === 5) {
            // Близко к центру
            winMultiplier = 1.5;
            resultText = `🎯 *Очень близко!*`;
        }
        else if (dartsValue === 4) {
            // Внутреннее кольцо
            winMultiplier = 1;
            resultText = `🎯 *Хороший бросок!*`;
        }
        else if (dartsValue === 3) {
            // Среднее кольцо
            winMultiplier = 0;
            resultText = `🎯 *Попадание!*`;
        }
        else if (dartsValue === 2) {
            // Внешнее кольцо - минимальный выигрыш
            winMultiplier = 0;
            resultText = `🎯 *Попадание!*`;
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
        const userId = ctx.from.id;
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
            // Списываем ставку
            user.stars -= betAmount;
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы:', sheetError);
                }
            }
            // Отправляем анимацию
            const animation = await ctx.replyWithDice({ emoji: '🏀' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const basketballValue = animation.dice.value;
            const winResult = this.calculateBasketballWin(basketballValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await userRepository.save(user);
                // Снова обновляем Google Sheets
                if (this.googleSheets) {
                    try {
                        await this.scheduleSheetsUpdate(user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка обновления таблицы после выигрыш:', sheetError);
                    }
                }
            }
            else {
                // Если проиграл, всё равно сохраняем пользователя
                await userRepository.save(user);
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_basketball';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            try {
                await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
                console.log(`💾 Баскетбол сохранен в БД для пользователя ${userId}: выигрыш ${winAmount}`);
            }
            catch (gameError) {
                console.error('❌ Ошибка сохранения баскетбола в БД:', gameError);
            }
            // Показываем результат
            await this.showAnimatedGameResult(ctx, user, 'animated_basketball', '🏀', basketballValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error(`❌ Error in playAnimatedBasketball for user ${userId}:`, error);
            try {
                await ctx.reply('❌ Ошибка в игре в баскетбол. Попробуйте позже.');
            }
            catch (e) {
                // Игнорируем
            }
            return;
        }
    }
    calculateBasketballWin(basketballValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (basketballValue === 5) {
            // Сверхдальний бросок/трехочковый
            winMultiplier = 2; // можно оставить 8, если хотите большую награду
            resultText = `🏀 Трехочковый!`;
        }
        else if (basketballValue === 4) {
            // Средний бросок
            winMultiplier = 1.5;
            resultText = `🏀 *Красивый бросок!*`;
        }
        else if (basketballValue === 3) {
            // Ближний бросок
            winMultiplier = 0; // или 2, если хотите
            resultText = `🏀 *Не получилось!* `;
        }
        else if (basketballValue === 2) {
            // Удар о щиток - НЕ ВЫИГРЫШ
            winMultiplier = 0;
            resultText = `🏀 *Щиток...*`;
        }
        else {
            // basketballValue === 1 - Полный промах
            winMultiplier = 0;
            resultText = `🏀 *Промах...*`;
        }
        return {
            winAmount: Math.floor(betAmount * winMultiplier),
            resultText
        };
    }
    async playAnimatedFootball(ctx, betAmount) {
        const userId = ctx.from.id;
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
            // Списываем ставку
            user.stars -= betAmount;
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы:', sheetError);
                }
            }
            // Отправляем анимацию
            const animation = await ctx.replyWithDice({ emoji: '⚽' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const footballValue = animation.dice.value;
            const winResult = this.calculateFootballWin(footballValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await userRepository.save(user);
                // Снова обновляем Google Sheets
                if (this.googleSheets) {
                    try {
                        await this.scheduleSheetsUpdate(user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка обновления таблицы после выигрыш:', sheetError);
                    }
                }
            }
            else {
                // Если проиграл, всё равно сохраняем пользователя
                await userRepository.save(user);
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_football';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            try {
                await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
                console.log(`💾 Футбол сохранен в БД для пользователя ${userId}: выигрыш ${winAmount}`);
            }
            catch (gameError) {
                console.error('❌ Ошибка сохранения футбола в БД:', gameError);
            }
            // Показываем результат
            await this.showAnimatedGameResult(ctx, user, 'animated_football', '⚽', footballValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error(`❌ Error in playAnimatedFootball for user ${userId}:`, error);
            try {
                await ctx.reply('❌ Ошибка в игре в футбол. Попробуйте позже.');
            }
            catch (e) {
                // Игнорируем
            }
            return;
        }
    }
    calculateFootballWin(footballValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (footballValue === 5) {
            // Самый верхний угол - идеальный гол
            winMultiplier = 2; // можно оставить 8 для большей награды
            resultText = `⚽ *ИДЕАЛЬНЫЙ ГОЛ!*!`;
        }
        else if (footballValue === 4) {
            // Верхний угол - отличный гол
            winMultiplier = 1.5;
            resultText = `⚽ Отличный удар!`;
        }
        else if (footballValue === 3) {
            // Попадание в ворота - обычный гол
            winMultiplier = 1;
            resultText = `⚽ *ГОЛ!*`;
        }
        else if (footballValue === 2) {
            // Попадание в штангу/перекладину - НЕ ГОЛ
            winMultiplier = 0;
            resultText = `⚽ *ШТАНГА!*`;
        }
        else {
            // footballValue === 1 - Полный промах
            winMultiplier = 0;
            resultText = `⚽ *Мимо...*`;
        }
        return {
            winAmount: Math.floor(betAmount * winMultiplier),
            resultText
        };
    }
    async playAnimatedBowling(ctx, betAmount) {
        const userId = ctx.from.id;
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
            // Списываем ставку
            user.stars -= betAmount;
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            await userRepository.save(user);
            // Немедленно обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.scheduleSheetsUpdate(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы:', sheetError);
                }
            }
            // Отправляем анимацию
            const animation = await ctx.replyWithDice({ emoji: '🎳' });
            await new Promise(resolve => setTimeout(resolve, 4000));
            const bowlingValue = animation.dice.value;
            const winResult = this.calculateBowlingWin(bowlingValue, betAmount);
            const { winAmount, resultText } = winResult;
            if (winAmount > 0) {
                user.stars += winAmount;
                user.totalEarned += winAmount;
                await userRepository.save(user);
                // Снова обновляем Google Sheets
                if (this.googleSheets) {
                    try {
                        await this.scheduleSheetsUpdate(user);
                    }
                    catch (sheetError) {
                        console.error('❌ Ошибка обновления таблицы после выигрыш:', sheetError);
                    }
                }
            }
            else {
                // Если проиграл, всё равно сохраняем пользователя
                await userRepository.save(user);
            }
            // Сохраняем игру в БД
            const game = new Game_1.Game();
            game.userId = user.telegramId;
            game.gameType = 'animated_bowling';
            game.betAmount = betAmount;
            game.winAmount = winAmount;
            game.result = winAmount > 0 ? 'win' : 'loss';
            try {
                await data_source_1.AppDataSource.getRepository(Game_1.Game).save(game);
                console.log(`💾 Боулинг сохранен в БД для пользователя ${userId}: выигрыш ${winAmount}`);
            }
            catch (gameError) {
                console.error('❌ Ошибка сохранения боулинга в БД:', gameError);
            }
            // Показываем результат
            await this.showAnimatedGameResult(ctx, user, 'animated_bowling', '🎳', bowlingValue, betAmount, winAmount, resultText);
        }
        catch (error) {
            console.error(`❌ Error in playAnimatedBowling for user ${userId}:`, error);
            try {
                await ctx.reply('❌ Ошибка в игре в боулинг. Попробуйте позже.');
            }
            catch (e) {
                // Игнорируем
            }
            return;
        }
    }
    calculateBowlingWin(bowlingValue, betAmount) {
        let winMultiplier = 0;
        let resultText = '';
        if (bowlingValue === 6) {
            // Страйк - все кегли сбиты
            winMultiplier = 2; // уменьшил с 12 для баланса
            resultText = `🎳 *СТРАЙК!* Все кегли сбиты!`;
        }
        else if (bowlingValue === 5) {
            // Почти страйк - 5 кеглей
            winMultiplier = 1.5;
            resultText = `🎳 *Почти страйк!*`;
        }
        else if (bowlingValue === 4) {
            // Хороший бросок - 4 кегли
            winMultiplier = 1;
            resultText = `🎳 *Отличный бросок!*`;
        }
        else if (bowlingValue === 3) {
            // Средний результат - 3 кегли
            winMultiplier = 0;
            resultText = `🎳 *Хороший бросок!*`;
        }
        else if (bowlingValue === 2) {
            // Слабый бросок - 2 кегли
            winMultiplier = 0;
            resultText = `🎳 *Попадание!*`;
        }
        else if (bowlingValue === 1) {
            // Слабый бросок - 2 кегли
            winMultiplier = 0;
            resultText = `🎳 *Слабый бросок...*`;
        }
        else if (bowlingValue === 0) {
            // Слабый бросок - 2 кегли
            winMultiplier = 0;
            resultText = `🎳 *Слабый бросок...*`;
        }
        else {
            // bowlingValue === 1 - Очень слабый бросок - 1 кегля
            winMultiplier = 0; // или 0 для полного проигрыша
            resultText = `🎳 *Слабый бросок...*`;
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
            'animated_bowling': '🎳 Боулинг',
            'guess_dice': '🎲 Угадайка'
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
    async createEmojiCaptcha(userId) {
        const captchaRepository = data_source_1.AppDataSource.getRepository(Captcha_1.Captcha);
        // Удаляем старые капчи для этого пользователя
        await captchaRepository.delete({ userId, solved: false });
        // Список эмодзи для капчи
        const allEmojis = [
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
            '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
            '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
            '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
            '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
            '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
            '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦',
            '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
            '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿',
            '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
            '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'
        ];
        // Выбираем случайный эмодзи как правильный ответ
        const correctEmoji = allEmojis[Math.floor(Math.random() * allEmojis.length)];
        // Создаем список из 9 эмодзи (3 правильных + 6 неправильных)
        const options = [correctEmoji, correctEmoji, correctEmoji];
        // Добавляем 6 разных неправильных эмодзи
        let added = 0;
        while (added < 6) {
            const randomEmoji = allEmojis[Math.floor(Math.random() * allEmojis.length)];
            if (randomEmoji !== correctEmoji && !options.includes(randomEmoji)) {
                options.push(randomEmoji);
                added++;
            }
        }
        // Перемешиваем массив
        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }
        // Создаем капчу
        const captcha = captchaRepository.create({
            userId,
            question: `Найдите и нажмите на все одинаковые смайлики`,
            answer: correctEmoji,
            type: 'emoji',
            options: options,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 минут
            solved: false,
            attempts: 0
        });
        await captchaRepository.save(captcha);
        // Отладочная информация
        console.log(`🎯 Создана капча ID: ${captcha.id}`);
        console.log(`🎯 Правильный эмодзи: ${correctEmoji}`);
        console.log(`🎯 Все эмодзи: ${options.join(', ')}`);
        console.log(`🎯 Позиции правильных: ${options.map((e, i) => e === correctEmoji ? i : -1).filter(i => i !== -1).join(', ')}`);
        return captcha;
    }
    async showEmojiCaptcha(ctx) {
        try {
            const user = ctx.user;
            // Создаем простую капчу без сохранения в БД
            const allEmojis = [
                '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
                '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
                '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
                '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
                '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
                '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓',
                '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦',
                '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞',
                '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿',
                '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
                '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'
            ];
            // Выбираем случайный эмодзи как правильный ответ
            const correctEmoji = allEmojis[Math.floor(Math.random() * allEmojis.length)];
            // Создаем список из 9 эмодзи (3 правильных + 6 неправильных)
            const options = [correctEmoji, correctEmoji, correctEmoji];
            // Добавляем 6 разных неправильных эмодзи
            let added = 0;
            while (added < 6) {
                const randomEmoji = allEmojis[Math.floor(Math.random() * allEmojis.length)];
                if (randomEmoji !== correctEmoji && !options.includes(randomEmoji)) {
                    options.push(randomEmoji);
                    added++;
                }
            }
            // Перемешиваем массив
            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }
            // Генерируем ID капчи
            const captchaId = Date.now();
            // Сохраняем в памяти
            this.captchaStore.set(captchaId, {
                correctEmoji,
                options,
                selected: [],
                attempts: 0,
                userId: user.telegramId
            });
            console.log(`🎯 Создана капча в памяти: ID=${captchaId}, Правильный эмодзи=${correctEmoji}`);
            console.log(`🎯 Правильные позиции: ${options.map((e, i) => e === correctEmoji ? i : -1).filter(i => i !== -1).join(', ')}`);
            // Создаем кнопки 3x3
            const buttons = [];
            for (let i = 0; i < 9; i += 3) {
                const row = [];
                for (let j = 0; j < 3; j++) {
                    const index = i + j;
                    if (index < options.length) {
                        row.push(telegraf_1.Markup.button.callback(options[index], `captcha_emoji_${captchaId}_${index}`));
                    }
                }
                buttons.push(row);
            }
            // Добавляем кнопки управления
            buttons.push([
                telegraf_1.Markup.button.callback('🔄 Новая капча', `refresh_captcha_${captchaId}`),
                telegraf_1.Markup.button.callback('❌ Отмена', 'cancel_captcha')
            ]);
            const keyboard = telegraf_1.Markup.inlineKeyboard(buttons);
            const message = `🎮 *Проверка безопасности*\n\n` +
                `Найдите и нажмите на *ВСЕ одинаковые* смайлики\n` +
                `Вам нужно найти *3 одинаковых* смайлика из 9\n\n` +
                `⚠️ *Правила:*\n` +
                `• Нажмите на все 3 одинаковых смайлика\n` +
                `• У вас есть 3 попытки\n` +
                `• Капча действует 5 минут\n\n` +
                `💰 *Награда:* 10 звезд за успешное прохождение`;
            await ctx.reply(message, {
                parse_mode: 'Markdown',
                ...keyboard
            });
        }
        catch (error) {
            console.error('❌ Error showing emoji captcha:', error);
            await ctx.reply('❌ Ошибка загрузки капчи. Попробуйте еще раз.');
        }
    }
    async handleEmojiCaptchaSelection(ctx, captchaId, selectedIndex) {
        try {
            const user = ctx.user;
            const captchaData = this.captchaStore.get(captchaId);
            if (!captchaData || captchaData.userId !== user.telegramId) {
                await ctx.answerCbQuery('❌ Капча устарела');
                return;
            }
            const { correctEmoji, options, selected, attempts } = captchaData;
            const selectedEmoji = options[selectedIndex];
            if (selected.includes(selectedIndex)) {
                await ctx.answerCbQuery('⚠️ Этот смайлик уже выбран');
                return;
            }
            // Проверяем правильность выбора
            if (selectedEmoji === correctEmoji) {
                // Правильный выбор
                selected.push(selectedIndex);
                // Проверяем, выбраны ли все 3 правильных смайлика
                const correctCount = options.filter(emoji => emoji === correctEmoji).length;
                console.log(`✅ Правильный выбор! Правильных эмодзи: ${selected.length}/${correctCount}`);
                if (selected.length === correctCount) {
                    // Все правильные выбраны!
                    this.captchaStore.delete(captchaId);
                    await ctx.answerCbQuery('🎉 Капча решена! Начисляем звезды...');
                    // Удаляем сообщение с капчей
                    try {
                        if (ctx.callbackQuery?.message) {
                            await ctx.deleteMessage();
                        }
                    }
                    catch (e) {
                        // Игнорируем ошибку удаления
                    }
                    // Завершаем регистрацию
                    await this.completeRegistrationWithCaptcha(ctx);
                    return;
                }
                else {
                    // Обновляем хранилище
                    this.captchaStore.set(captchaId, { ...captchaData, selected });
                    await ctx.answerCbQuery(`✅ Правильно! Осталось: ${correctCount - selected.length}`);
                }
            }
            else {
                // Неправильный выбор
                const newAttempts = attempts + 1;
                if (newAttempts >= 3) {
                    this.captchaStore.delete(captchaId);
                    await ctx.answerCbQuery('❌ Слишком много ошибок! Попробуйте новую капчу');
                    // Удаляем старое сообщение и показываем новую капчу
                    try {
                        if (ctx.callbackQuery?.message) {
                            await ctx.deleteMessage();
                        }
                    }
                    catch (e) {
                        // Игнорируем ошибку удаления
                    }
                    await this.showEmojiCaptcha(ctx);
                    return;
                }
                else {
                    // Обновляем хранилище
                    this.captchaStore.set(captchaId, { ...captchaData, attempts: newAttempts });
                    await ctx.answerCbQuery(`❌ Неправильно! Попыток осталось: ${3 - newAttempts}`);
                }
            }
        }
        catch (error) {
            console.error('❌ Error handling emoji captcha:', error);
            await ctx.answerCbQuery('❌ Ошибка обработки капчи');
        }
    }
    async completeRegistrationWithCaptcha(ctx) {
        try {
            const user = ctx.user;
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            // Начисляем звезды за успешную капчу
            user.stars += 10; // 10 звезд за капчу
            user.totalEarned += 10;
            user.completedInitialSetup = true;
            await userRepository.save(user);
            // Обновляем Google Sheets
            if (this.googleSheets) {
                try {
                    await this.googleSheets.updateUserInSheets(user);
                }
                catch (sheetError) {
                    console.error('❌ Ошибка обновления таблицы:', sheetError);
                }
            }
            // Реферальный бонус (если есть реферер)
            if (user.referrerId) {
                const referrerRepository = data_source_1.AppDataSource.getRepository(User_1.User);
                const referrer = await referrerRepository.findOne({
                    where: { id: user.referrerId }
                });
                if (referrer) {
                    // Начисляем бонус рефереру
                    referrer.stars += 5;
                    referrer.referralsCount = (referrer.referralsCount || 0) + 1;
                    referrer.totalEarned += 5;
                    await referrerRepository.save(referrer);
                    // Обновляем реферера в Google Sheets
                    if (this.googleSheets) {
                        try {
                            await this.googleSheets.updateUserInSheets(referrer);
                        }
                        catch (sheetError) {
                            console.error('❌ Ошибка обновления реферера в таблице:', sheetError);
                        }
                    }
                    // Уведомляем реферера
                    try {
                        await this.bot.telegram.sendMessage(referrer.telegramId, `🎉 *По вашей ссылке зарегистрировался новый пользователь!*\n\n` +
                            `✅ Вам начислено: +5 ⭐\n` +
                            `👤 Приглашенный: ${user.firstName || 'Новый пользователь'}\n` +
                            `📊 Ваш баланс: ${referrer.stars} ⭐\n` +
                            `👥 Всего приглашено: ${referrer.referralsCount} друзей`, { parse_mode: 'Markdown' });
                    }
                    catch (error) {
                        console.error(`❌ Ошибка уведомления реферера:`, error);
                    }
                }
            }
            // Отправляем сообщение об успехе
            let successMessage = `🎉 *Регистрация завершена!*\n\n` +
                `✅ Вы успешно прошли проверку безопасности\n` +
                `💰 Начислено: 10 звезд\n`;
            if (user.referrerId) {
                successMessage += `🎁 *Реферальный бонус:*\n` +
                    `• Вы получили: 10 ⭐\n` +
                    `• Пригласивший получил: 5 ⭐\n\n`;
            }
            successMessage += `📊 Баланс: ${user.stars} ⭐\n\n` +
                `🎮 Теперь вы можете играть и зарабатывать!`;
            // Отправляем новое сообщение
            await ctx.reply(successMessage, { parse_mode: 'Markdown' });
            // Показываем главное меню через 2 секунды
            setTimeout(async () => {
                await this.showMainMenu(ctx);
            }, 2000);
        }
        catch (error) {
            console.error('❌ Error completing registration with captcha:', error);
            await ctx.reply('❌ Ошибка завершения регистрации.');
        }
    }
    async showAdminPanel(ctx) {
        const keyboard = telegraf_1.Markup.keyboard([
            ['📊 Статистика'],
            ['📋 Заявки на вывод', '👥 Топ пользователей'],
            ['↩️ Главное меню']
        ]).resize();
        await ctx.reply('👨‍💻 АДМИН ПАНЕЛЬ\n\n' +
            'Выберите действие:', keyboard);
        // Обработка админ команд
        this.setupAdminHandlers();
    }
    setupAdminHandlers() {
        // ============ СУЩЕСТВУЮЩИЙ КОД (не удаляем) ============
        // Статистика
        this.bot.hears('📊 Статистика', async (ctx) => {
            // ТОЛЬКО ДЛЯ АДМИНОВ
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
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
        this.bot.command('sync_user', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав');
                return;
            }
            const args = ctx.message.text.split(' ');
            if (args.length !== 2) {
                await ctx.reply('Использование: /sync_user <telegramId>\nПример: /sync_user 935888279');
                return;
            }
            const telegramId = parseInt(args[1]);
            if (isNaN(telegramId)) {
                await ctx.reply('Ошибка: telegramId должен быть числом');
                return;
            }
            try {
                await ctx.reply(`🔄 Синхронизирую пользователя ${telegramId} из Google Sheets...`);
                // Ищем пользователя в Sheets
                const response = await this.googleSheets.sheets.spreadsheets.values.get({
                    spreadsheetId: process.env.GOOGLE_SHEET_ID,
                    range: 'Пользователи!A2:H',
                });
                const rows = response.data.values || [];
                const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
                for (const row of rows) {
                    const [, telegramIdStr, , , starsStr, , , status] = row;
                    if (parseInt(telegramIdStr) === telegramId) {
                        const user = await userRepository.findOne({
                            where: { telegramId: telegramId }
                        });
                        if (user) {
                            const stars = parseInt(starsStr) || 0;
                            user.stars = stars;
                            user.status = status || 'active';
                            user.updatedAt = new Date();
                            await userRepository.save(user);
                            await ctx.reply(`✅ Пользователь ${telegramId} синхронизирован\n` +
                                `💰 Новый баланс: ${stars} звезд\n` +
                                `📊 Статус: ${status}`);
                            return;
                        }
                    }
                }
                await ctx.reply(`❌ Пользователь ${telegramId} не найден в Google Sheets`);
            }
            catch (error) {
                await ctx.reply(`❌ Ошибка: ${error.message}`);
            }
        });
        this.bot.command('debug_sheet', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            try {
                await ctx.reply('🔍 Проверяю структуру таблицы...');
                await this.googleSheets.debugSheetStructure();
                await ctx.reply('✅ Проверка завершена. Смотрите логи консоли.');
            }
            catch (error) {
                await ctx.reply(`❌ Ошибка: ${error.message}`);
            }
        });
        // Рассылка
        // Заявки на вывод - ИСПРАВЛЕННАЯ ВЕРСИЯ
        this.bot.hears('📋 Заявки на вывод', async (ctx) => {
            // ПРОВЕРКА АДМИНА
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            const withdrawalRepo = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
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
                // ИСПРАВЛЕННАЯ СТРОКА - защита от null
                const username = user?.username
                    ? `@${user.username}`
                    : withdrawal.username
                        ? `@${withdrawal.username}`
                        : 'Нет username';
                const firstName = user?.firstName
                    ? user.firstName
                    : withdrawal.firstName || 'Не указано';
                const telegramId = user?.telegramId
                    ? user.telegramId
                    : withdrawal.telegramId || 'Не указан';
                message +=
                    `🆔 ID заявки: #${withdrawal.id}\n` +
                        `👤 Пользователь: ${firstName} (${username})\n` +
                        `🆔 User ID: ${telegramId}\n` +
                        `💰 Сумма: ${withdrawal.amount} звезд\n` +
                        `💳 Кошелек: ${withdrawal.wallet}\n` +
                        `📅 Дата: ${withdrawal.createdAt.toLocaleDateString('ru-RU')}\n` +
                        `---\n`;
            }
            await ctx.reply(message);
        });
        // Топ пользователей - тоже исправляем
        this.bot.hears('👥 Топ пользователей', async (ctx) => {
            // ПРОВЕРКА АДМИНА
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            const userRepo = data_source_1.AppDataSource.getRepository(User_1.User);
            const topUsers = await userRepo.find({
                order: { stars: 'DESC' },
                take: 10
            });
            let message = '🏆 ТОП-10 ПОЛЬЗОВАТЕЛЕЙ:\n\n';
            topUsers.forEach((user, index) => {
                // ИСПРАВЛЕННАЯ СТРОКА - защита от null/undefined
                const username = user?.username
                    ? `@${user.username}`
                    : 'Аноним';
                message +=
                    `${index + 1}. ${username}\n` +
                        `   ⭐ Звезд: ${user.stars || 0}\n` +
                        `   👥 Рефералов: ${user.referralsCount || 0}\n` +
                        `   💎 Всего заработано: ${user.totalEarned || 0}\n` +
                        `---\n`;
            });
            await ctx.reply(message);
        });
        // Главное меню
        this.bot.hears('↩️ Главное меню', async (ctx) => {
            await this.showMainMenu(ctx);
        });
        // ============ НОВЫЕ КОМАНДЫ ДЛЯ СИНХРОНИЗАЦИИ ============
        // Команда для синхронизации из Sheets в БД
        this.bot.command('sync_from_sheets', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            try {
                await ctx.reply('🔄 Запускаю синхронизацию данных ИЗ Google Sheets В БД...');
                const result = await this.googleSheets.forceSyncFromSheets();
                const report = `
📊 *ОТЧЕТ СИНХРОНИЗАЦИИ Sheets → БД*

✅ *Статус:* ${result.success ? 'Успешно' : 'С ошибками'}
📝 *Сообщение:* ${result.message}

📈 *Детали:*
• 👥 Пользователей обновлено: ${result.details.usersUpdated}
• 💰 Выплат обновлено: ${result.details.withdrawalsUpdated}
• ❌ Ошибок: ${result.details.errors}

${result.success ? '🎉 Все данные успешно синхронизированы!' : '⚠️ Рекомендуется проверить логи'}
`;
                await ctx.reply(report, { parse_mode: 'Markdown' });
            }
            catch (error) {
                console.error('❌ Ошибка выполнения команды sync_from_sheets:', error);
                await ctx.reply(`❌ Ошибка при синхронизации: ${error.message}`);
            }
        });
        // Команда для принудительной синхронизации с подтверждением
        this.bot.command('sync_sheets_force', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да, синхронизировать', callback_data: 'confirm_sync_sheets' },
                        { text: '❌ Отмена', callback_data: 'cancel_sync_sheets' }
                    ]
                ]
            };
            await ctx.reply(`⚠️ *ВНИМАНИЕ: ПРИНУДИТЕЛЬНАЯ СИНХРОНИЗАЦИЯ*\n\n` +
                `Эта команда перезапишет данные в БД данными из Google Sheets.\n\n` +
                `• 👥 Обновит данные пользователей\n` +
                `• 💰 Обновит статусы выплат\n` +
                `• 💎 Синхронизирует балансы\n\n` +
                `Вы уверены, что хотите продолжить?`, { parse_mode: 'Markdown', reply_markup: keyboard });
        });
        // Команда для проверки статуса синхронизации
        this.bot.command('sync_status', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            try {
                const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
                const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
                const totalUsers = await userRepository.count();
                const totalWithdrawals = await withdrawalRepository.count();
                let sheetsUsers = 0;
                let sheetsWithdrawals = 0;
                try {
                    const usersResponse = await this.googleSheets.sheets.spreadsheets.values.get({
                        spreadsheetId: process.env.GOOGLE_SHEET_ID,
                        range: 'Пользователи!A2:A',
                    });
                    sheetsUsers = usersResponse.data.values?.length || 0;
                    const withdrawalsResponse = await this.googleSheets.sheets.spreadsheets.values.get({
                        spreadsheetId: process.env.GOOGLE_SHEET_ID,
                        range: 'Выплаты!A2:A',
                    });
                    sheetsWithdrawals = withdrawalsResponse.data.values?.length || 0;
                }
                catch (error) {
                    console.error('Ошибка получения данных из Sheets:', error);
                }
                const diffUsers = Math.abs(sheetsUsers - totalUsers);
                const diffWithdrawals = Math.abs(sheetsWithdrawals - totalWithdrawals);
                const statusMessage = `
📊 *СТАТУС СИНХРОНИЗАЦИИ*

*База данных:*
• 👥 Пользователей: ${totalUsers}
• 💰 Выплат: ${totalWithdrawals}

*Google Sheets:*
• 👥 Пользователей: ${sheetsUsers}
• 💰 Выплат: ${sheetsWithdrawals}

*Расхождения:*
• 👥 Пользователи: ${diffUsers > 0 ? `⚠️ ${diffUsers}` : '✅ Нет'}
• 💰 Выплаты: ${diffWithdrawals > 0 ? `⚠️ ${diffWithdrawals}` : '✅ Нет'}

*Команды для синхронизации:*
• /sync_from_sheets - Sheets → БД (из таблицы в базу)
• /sync_sheets - БД → Sheets (из базы в таблицу)
• /sync_sheets_force - Принудительная синхронизация с подтверждением
`;
                await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
            }
            catch (error) {
                await ctx.reply(`❌ Ошибка получения статуса: ${error.message}`);
            }
        });
        // Команда для просмотра справки по админ командам
        this.bot.command('admin_help', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            // Используем HTML разметку, она более надежная
            const helpMessage = `
<b>👑 АДМИН ПАНЕЛЬ - КОМАНДЫ</b>

<b>Синхронизация с Google Sheets:</b>
• /sync_from_sheets - Синхронизировать данные ИЗ Sheets В БД
• /sync_sheets - Синхронизировать данные ИЗ БД В Sheets
• /sync_sheets_force - Принудительная синхронизация (с подтверждением)
• /sync_status - Показать статус синхронизации

<b>Управление таблицами:</b>
• /fix_sheet - Исправить таблицу выплат
• /sheet - Открыть Google Sheets
• /sync_all - Полная синхронизация

<b>Админ меню (кнопки):</b>
• 📊 Статистика - Общая статистика бота
• 📋 Заявки на вывод - Список pending заявок
• 👥 Топ пользователей - Топ-10 по звездам
• ↩️ Главное меню - Вернуться в меню

<b>Рассылка сообщений:</b>
• /broadcast - Отправить сообщение всем пользователям


<code>⚠️ Важно:</code>
• /sync_from_sheets - обновляет БД данными из Sheets
• /sync_sheets - обновляет Sheets данными из БД
• В случае рассинхронизации используйте /sync_status для диагностики
`;
            await ctx.reply(helpMessage, { parse_mode: 'HTML' });
        });
        // Обновляем существующую команду /sync_sheets для ясности
        this.bot.command('sync_sheets', async (ctx) => {
            if (!this.isAdmin(ctx.from.id)) {
                await ctx.reply('⛔ У вас нет прав для выполнения этой команды');
                return;
            }
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 БД → Sheets', callback_data: 'sync_db_to_sheets' },
                        { text: '🔄 Sheets → БД', callback_data: 'sync_sheets_to_db' }
                    ],
                    [
                        { text: '📊 Статус', callback_data: 'sync_status_action' }
                    ]
                ]
            };
            await ctx.reply('📊 *Выберите направление синхронизации:*\n\n' +
                '• *БД → Sheets*: Обновить Google Sheets данными из базы\n' +
                '• *Sheets → БД*: Обновить базу данных данными из Google Sheets', { parse_mode: 'Markdown', reply_markup: keyboard });
        });
        // ============ ОБРАБОТЧИКИ КНОПОК ДЛЯ СИНХРОНИЗАЦИИ ============
        // Обработчик кнопки подтверждения синхронизации
        this.bot.action('confirm_sync_sheets', async (ctx) => {
            try {
                const userId = ctx.from?.id;
                if (!userId || !this.isAdmin(userId)) {
                    await ctx.answerCbQuery('⛔ У вас нет прав');
                    return;
                }
                await ctx.editMessageText('🔄 Синхронизация запущена...');
                const result = await this.googleSheets.forceSyncFromSheets();
                await ctx.editMessageText(`📊 *РЕЗУЛЬТАТ СИНХРОНИЗАЦИИ*\n\n` +
                    `${result.message}\n\n` +
                    `👥 Пользователей: ${result.details.usersUpdated}\n` +
                    `💰 Выплат: ${result.details.withdrawalsUpdated}\n` +
                    `❌ Ошибок: ${result.details.errors}`, { parse_mode: 'Markdown' });
            }
            catch (error) {
                await ctx.editMessageText(`❌ Ошибка: ${error.message}`);
            }
        });
        // Обработчик отмены синхронизации
        this.bot.action('cancel_sync_sheets', async (ctx) => {
            await ctx.editMessageText('❌ Синхронизация отменена');
        });
        // Обработчики кнопок для выбора направления синхронизации
        this.bot.action('sync_db_to_sheets', async (ctx) => {
            try {
                await ctx.answerCbQuery('🔄 Синхронизация БД → Sheets...');
                await this.googleSheets.fullSyncToSheets();
                await ctx.answerCbQuery('✅ Синхронизировано БД → Sheets');
                await ctx.editMessageText('✅ Google Sheets обновлена данными из БД');
            }
            catch (error) {
                await ctx.answerCbQuery('❌ Ошибка');
                await ctx.editMessageText(`❌ Ошибка синхронизации: ${error.message}`);
            }
        });
        this.bot.action('sync_sheets_to_db', async (ctx) => {
            try {
                await ctx.answerCbQuery('🔄 Синхронизация Sheets → БД...');
                const result = await this.googleSheets.forceSyncFromSheets();
                await ctx.answerCbQuery('✅ Синхронизировано Sheets → БД');
                await ctx.editMessageText(`✅ Данные из Google Sheets синхронизированы в БД\n\n` +
                    `👥 Пользователей: ${result.details.usersUpdated}\n` +
                    `💰 Выплат: ${result.details.withdrawalsUpdated}\n` +
                    `❌ Ошибок: ${result.details.errors}`);
            }
            catch (error) {
                await ctx.answerCbQuery('❌ Ошибка');
                await ctx.editMessageText(`❌ Ошибка синхронизации: ${error.message}`);
            }
        });
        this.bot.action('sync_status_action', async (ctx) => {
            await ctx.answerCbQuery('📊 Получаю статус...');
            try {
                const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
                const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
                const totalUsers = await userRepository.count();
                const totalWithdrawals = await withdrawalRepository.count();
                await ctx.editMessageText(`📊 *Текущий статус БД:*\n\n` +
                    `👥 Пользователей: ${totalUsers}\n` +
                    `💰 Выплат: ${totalWithdrawals}\n\n` +
                    `Используйте /sync_status для детального отчета`);
            }
            catch (error) {
                await ctx.editMessageText('❌ Ошибка получения статуса');
            }
        });
    }
    launch() {
        // Обработчик ошибок Telegraf
        this.bot.catch((err, ctx) => {
            console.error('❌ Telegraf error:', err);
            // Игнорируем ошибки дублирования пользователей (они обрабатываются в getUser)
            if (err?.message?.includes('users_telegramId_key') ||
                err?.code === '23505') {
                console.log('⚠️ Ignoring duplicate user error');
                return;
            }
            try {
                if (ctx.callbackQuery) {
                    ctx.answerCbQuery('❌ Ошибка, попробуйте позже').catch(() => { });
                }
            }
            catch (e) {
                // Игнорируем
            }
        });
        this.bot.launch();
        console.log('✅ Bot is running...');
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}
// Запуск бота
const bot = new StarBot();
bot.launch();
