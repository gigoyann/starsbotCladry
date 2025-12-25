"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetsService = void 0;
// src/services/google-sheets.service.ts
const googleapis_1 = require("googleapis");
const User_1 = require("../entities/User");
const Withdrawal_1 = require("../entities/Withdrawal");
const typeorm_1 = require("typeorm");
const data_source_1 = require("../config/data-source");
class GoogleSheetsService {
    constructor() {
        // Инициализация авторизации
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
            throw new Error('Google Sheets credentials are not set in environment variables');
        }
        this.auth = new googleapis_1.google.auth.JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = googleapis_1.google.sheets({ version: 'v4', auth: this.auth });
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    }
    async initializeWithdrawalSheet() {
        try {
            const headers = [
                'ID выплаты',
                'Telegram ID',
                'Username',
                'Имя',
                'Сумма (⭐)',
                'Статус',
                'Дата создания',
                'Дата обработки',
                'Уведомление отправлено (ДА/НЕТ)'
            ];
            // Проверяем существующие заголовки
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A1:I1',
            });
            const currentHeaders = response.data.values?.[0] || [];
            // Если заголовки не совпадают, обновляем их
            if (JSON.stringify(currentHeaders) !== JSON.stringify(headers)) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Выплаты!A1:I1',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [headers] }
                });
                console.log('✅ Заголовки таблицы выплат обновлены');
            }
            // Настраиваем условное форматирование для чипов
            await this.setupChipFormatting();
            return true;
        }
        catch (error) {
            console.error('❌ Ошибка инициализации листа выплат:', error.message);
            return false;
        }
    }
    async syncNewWithdrawalsOnly() {
        try {
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            // Получаем последние выплаты
            const withdrawals = await withdrawalRepository.find({
                relations: ['user'],
                order: { createdAt: 'DESC' },
                take: 50 // Ограничиваем количество
            });
            if (withdrawals.length === 0) {
                console.log('📊 Нет выплат для синхронизации');
                return 0;
            }
            // Получаем текущие данные из таблицы
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A2:I',
            });
            const existingRows = response.data.values || [];
            // Исправляем TypeScript ошибку - добавляем тип для row
            const existingIds = new Set(existingRows.map((row) => row[0]));
            // Фильтруем только новые выплаты (которых нет в таблице)
            const newWithdrawals = withdrawals.filter(w => !existingIds.has(w.id.toString()));
            if (newWithdrawals.length === 0) {
                console.log('📊 Все выплаты уже синхронизированы');
                return 0;
            }
            // Добавляем только новые
            for (const withdrawal of newWithdrawals) {
                await this.syncWithdrawalSimple(withdrawal, undefined);
            }
            console.log(`✅ Добавлено ${newWithdrawals.length} новых выплат`);
            return newWithdrawals.length;
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации новых выплат:', error.message);
            return 0;
        }
    }
    async setupChipFormatting() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                fields: 'sheets.properties'
            });
            const sheet = spreadsheet.data.sheets?.find((s) => s.properties.title === 'Выплаты');
            if (!sheet) {
                console.error('❌ Лист "Выплаты" не найден');
                return;
            }
            const sheetId = sheet.properties.sheetId;
            // УПРОЩЕННАЯ ВЕРСИЯ - только цвет фона и текста
            const requests = [
                // 1. approved - зеленый чип
                {
                    addConditionalFormatRule: {
                        rule: {
                            ranges: [{
                                    sheetId: sheetId,
                                    startRowIndex: 1,
                                    endRowIndex: 1000,
                                    startColumnIndex: 5,
                                    endColumnIndex: 6
                                }],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_EQ',
                                    values: [{ userEnteredValue: 'approved' }]
                                },
                                format: {
                                    backgroundColor: { red: 0.85, green: 0.96, blue: 0.87 },
                                    textFormat: {
                                        foregroundColor: { red: 0.15, green: 0.55, blue: 0.27 },
                                        bold: true
                                    }
                                }
                            }
                        },
                        index: 0
                    }
                },
                // 2. rejected - красный чип
                {
                    addConditionalFormatRule: {
                        rule: {
                            ranges: [{
                                    sheetId: sheetId,
                                    startRowIndex: 1,
                                    endRowIndex: 1000,
                                    startColumnIndex: 5,
                                    endColumnIndex: 6
                                }],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_EQ',
                                    values: [{ userEnteredValue: 'rejected' }]
                                },
                                format: {
                                    backgroundColor: { red: 0.96, green: 0.87, blue: 0.87 },
                                    textFormat: {
                                        foregroundColor: { red: 0.75, green: 0.22, blue: 0.22 },
                                        bold: true
                                    }
                                }
                            }
                        },
                        index: 1
                    }
                },
                // 3. pending - серый чип
                {
                    addConditionalFormatRule: {
                        rule: {
                            ranges: [{
                                    sheetId: sheetId,
                                    startRowIndex: 1,
                                    endRowIndex: 1000,
                                    startColumnIndex: 5,
                                    endColumnIndex: 6
                                }],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_EQ',
                                    values: [{ userEnteredValue: 'pending' }]
                                },
                                format: {
                                    backgroundColor: { red: 0.96, green: 0.96, blue: 0.96 },
                                    textFormat: {
                                        foregroundColor: { red: 0.45, green: 0.45, blue: 0.45 },
                                        bold: true
                                    }
                                }
                            }
                        },
                        index: 2
                    }
                }
            ];
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: { requests }
            });
            console.log('✅ Стили чипов настроены');
        }
        catch (error) {
            console.error('❌ Ошибка настройки стилей чипов:', error.message);
        }
    }
    async syncWithdrawalSimple(withdrawal, bot) {
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const user = await userRepository.findOne({
                where: { id: withdrawal.userId }
            });
            if (!user) {
                console.error('❌ Пользователь не найден для выплаты');
                return;
            }
            // Ищем существующую запись выплаты
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A2:I',
            });
            const rows = response.data.values || [];
            const rowIndex = rows.findIndex((row) => row[0] === withdrawal.id.toString());
            // ПРАВИЛЬНЫЙ ПОРЯДОК ДАННЫХ:
            // A: ID выплаты (withdrawal.id)
            // B: Telegram ID (user.telegramId)
            // C: Username (user.username)
            // D: Имя (user.firstName)
            // E: Сумма (withdrawal.amount)
            // F: Статус (withdrawal.status)
            // G: Дата создания (withdrawal.createdAt)
            // H: Дата обработки (withdrawal.processedAt)
            // I: Уведомление отправлено
            const withdrawalData = [
                withdrawal.id, // A: ID выплаты
                user.telegramId.toString(), // B: Telegram ID
                user.username || '', // C: Username
                user.firstName || '', // D: Имя
                withdrawal.amount.toString(), // E: Сумма (⭐)
                withdrawal.status, // F: Статус
                this.formatDate(withdrawal.createdAt), // G: Дата создания
                withdrawal.processedAt ? this.formatDate(withdrawal.processedAt) : '', // H: Дата обработки
                'НЕТ' // I: Уведомление отправлено
            ];
            console.log(`📊 Данные для синхронизации выплаты ${withdrawal.id}:`, {
                id: withdrawalData[0],
                telegramId: withdrawalData[1],
                username: withdrawalData[2],
                firstName: withdrawalData[3],
                amount: withdrawalData[4],
                status: withdrawalData[5],
                createdAt: withdrawalData[6],
                processedAt: withdrawalData[7]
            });
            if (rowIndex !== -1) {
                // Получаем старый статус из таблицы
                const oldStatus = rows[rowIndex][5]; // Колонка F (индекс 5)
                const newStatus = withdrawal.status;
                // Обновляем запись
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Выплаты!A${rowIndex + 2}:I${rowIndex + 2}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [withdrawalData] }
                });
                // Проверяем, изменился ли статус с pending на approved/rejected
                if (oldStatus === 'pending' && (newStatus === 'approved' || newStatus === 'rejected')) {
                    // Отправляем уведомление пользователю
                    await this.sendWithdrawalNotification(withdrawal, user, newStatus, bot);
                    // Обновляем колонку "Уведомление отправлено"
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: `Выплаты!I${rowIndex + 2}`,
                        valueInputOption: 'USER_ENTERED',
                        requestBody: { values: [['ДА']] }
                    });
                }
                console.log(`✅ Выплата ${withdrawal.id} обновлена в Google Sheets`);
            }
            else {
                // Добавляем новую запись
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Выплаты!A2:I',
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [withdrawalData] }
                });
                console.log(`✅ Выплата ${withdrawal.id} добавлена в Google Sheets`);
            }
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации выплаты:', error.message);
            console.error('❌ Stack trace:', error.stack);
        }
    }
    async checkAndUpdateWithdrawalsFromSheet(bot) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A2:J', // Читаем больше колонок на всякий случай
            });
            const rows = response.data.values || [];
            console.log(`📊 Найдено ${rows.length} строк в таблице выплат`);
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            if (rows.length > 0) {
                console.log('Первая строка для примера:', rows[0]);
            }
            let updatedCount = 0;
            let notifiedCount = 0;
            for (const row of rows) {
                const [id, // A: ID выплаты
                telegramId, // B: Telegram ID
                username, // C: Username
                firstName, // D: Имя
                amount, // E: Сумма
                status, // F: Статус
                createdAt, // G: Дата создания
                processedAt, // H: Дата обработки
                notified // I: Уведомление отправлено
                ] = row;
                const withdrawal = await withdrawalRepository.findOne({
                    where: { id: parseInt(id) }
                });
                if (withdrawal) {
                    let needsUpdate = false;
                    // Проверяем статус
                    if (withdrawal.status !== status) {
                        console.log(`🔄 Статус выплаты ${id} изменен: ${withdrawal.status} → ${status}`);
                        withdrawal.status = status;
                        needsUpdate = true;
                    }
                    // Обновляем дату обработки, если статус изменился на approved/rejected
                    if ((status === 'approved' || status === 'rejected') && !withdrawal.processedAt) {
                        withdrawal.processedAt = new Date();
                        needsUpdate = true;
                    }
                    // Сохраняем изменения в БД
                    if (needsUpdate) {
                        await withdrawalRepository.save(withdrawal);
                        updatedCount++;
                        // Отправляем уведомление, если статус изменился и уведомление еще не отправлялось
                        if (withdrawal.status !== 'pending' && notified !== 'ДА') {
                            const user = await userRepository.findOne({
                                where: { telegramId: parseInt(telegramId) }
                            });
                            if (user && bot) {
                                await this.sendWithdrawalNotification(withdrawal, user, withdrawal.status, bot);
                                // Отмечаем, что уведомление отправлено
                                const rowIndex = rows.indexOf(row) + 2;
                                await this.sheets.spreadsheets.values.update({
                                    spreadsheetId: this.spreadsheetId,
                                    range: `Выплаты!I${rowIndex}`,
                                    valueInputOption: 'USER_ENTERED',
                                    requestBody: { values: [['ДА']] }
                                });
                                notifiedCount++;
                            }
                        }
                    }
                }
            }
            if (updatedCount > 0) {
                console.log(`✅ Обновлено ${updatedCount} выплат из Google Sheets`);
                console.log(`📨 Отправлено ${notifiedCount} уведомлений`);
            }
            return { updatedCount, notifiedCount };
        }
        catch (error) {
            console.error('❌ Ошибка проверки статусов выплат из таблицы:', error.message);
            return { updatedCount: 0, notifiedCount: 0 };
        }
    }
    async fixWithdrawalsTable() {
        try {
            console.log('🛠️ Исправление таблицы выплат...');
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const withdrawals = await withdrawalRepository.find({
                relations: ['user']
            });
            const withdrawalsData = withdrawals.map((withdrawal) => {
                const user = withdrawal.user;
                return [
                    withdrawal.id.toString(), // A: ID выплаты
                    user?.telegramId?.toString() || '', // B: Telegram ID
                    user?.username || '', // C: Username
                    user?.firstName || '', // D: Имя
                    withdrawal.amount.toString(), // E: Сумма (⭐)
                    withdrawal.status, // F: Статус
                    this.formatDate(withdrawal.createdAt), // G: Дата создания
                    withdrawal.processedAt ? this.formatDate(withdrawal.processedAt) : '', // H: Дата обработки
                    'НЕТ' // I: Уведомление отправлено
                ];
            });
            // Очищаем таблицу (сохраняем заголовки)
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A2:I',
            });
            // Записываем исправленные данные
            if (withdrawalsData.length > 0) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Выплаты!A2:I',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: withdrawalsData }
                });
            }
            console.log(`✅ Таблица выплат исправлена, записано ${withdrawals.length} выплат`);
            return withdrawals.length;
        }
        catch (error) {
            console.error('❌ Ошибка исправления таблицы выплат:', error.message);
            return 0;
        }
    }
    async sendWithdrawalNotification(withdrawal, user, status, bot) {
        try {
            if (!bot) {
                console.log('⚠️ Бот не передан, уведомление не отправлено');
                return;
            }
            let message = '';
            if (status === 'approved') {
                message = `🎉 *Выплата одобрена!*\n\n` +
                    `📋 ID заявки: #${withdrawal.id}\n` +
                    `💰 Сумма: *${withdrawal.amount} ⭐*\n` +
                    `📅 Дата обработки: ${new Date().toLocaleDateString('ru-RU')}\n\n` +
                    `✅ Средства будут зачислены в течение 24 часов`;
            }
            else if (status === 'rejected') {
                message = `❌ *Выплата отклонена*\n\n` +
                    `📋 ID заявки: #${withdrawal.id}\n` +
                    `💰 Сумма: ${withdrawal.amount} ⭐\n` +
                    `📅 Дата обработки: ${new Date().toLocaleDateString('ru-RU')}\n\n` +
                    `⚠️ Для уточнения деталей обратитесь в поддержку`;
            }
            if (message) {
                await bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
                console.log(`📨 Уведомление отправлено пользователю ${user.telegramId} о выплате ${withdrawal.id}`);
            }
        }
        catch (error) {
            console.error('❌ Ошибка отправки уведомления:', error.message);
        }
    }
    // ============ ВСПОМОГАТЕЛЬНЫЙ МЕТОД ДЛЯ ФОРМАТИРОВАНИЯ ДАТЫ ============
    formatDate(date) {
        if (!date)
            return '';
        try {
            // Используем ISO формат для единообразия
            return date.toISOString();
        }
        catch (error) {
            console.error('❌ Ошибка форматирования даты:', date, error);
            return '';
        }
    }
    // ============ ПЕРИОДИЧЕСКАЯ ПРОВЕРКА ВЫПЛАТ ============
    startWithdrawalChecker(bot, intervalMinutes = 5) {
        console.log(`⏰ Запущен планировщик проверки выплат каждые ${intervalMinutes} минут`);
        setInterval(async () => {
            console.log('🔍 Проверка обновлений статусов выплат в Google Sheets...');
            const result = await this.checkAndUpdateWithdrawalsFromSheet(bot);
            if (result.updatedCount > 0) {
                console.log(`🔄 Обновлено ${result.updatedCount} выплат, отправлено ${result.notifiedCount} уведомлений`);
            }
        }, intervalMinutes * 60 * 1000);
    }
    // Инициализация таблицы
    async initializeSheets() {
        try {
            // Проверяем существование таблицы
            await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
            });
            console.log('✅ Google Sheets подключена');
            return true;
        }
        catch (error) {
            console.error('❌ Ошибка подключения к Google Sheets:', error.message);
            return false;
        }
    }
    // ============ ЛИСТ 1: ПОЛЬЗОВАТЕЛИ ============
    async syncUser(user) {
        try {
            // Ищем пользователя в таблице
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A2:I', // Теперь 9 колонок (A-I)
            });
            const rows = response.data.values || [];
            const rowIndex = rows.findIndex((row) => row[0] === user.id.toString());
            const userData = [
                user.id, // A: ID
                user.telegramId, // B: Telegram ID
                user.firstName || '', // C: Имя
                user.username || '', // D: Username
                user.stars, // E: Баланс
                user.referralsCount || 0, // F: Рефералы
                user.createdAt.toISOString(), // G: Дата создания
                user.status, // H: Статус (active/blocked/pending)
                user.completedInitialSetup ? 'active' : 'pending' // I: Настройка (устаревшее поле, можно оставить для совместимости)
            ];
            if (rowIndex !== -1) {
                // Обновляем существующую запись
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Пользователи!A${rowIndex + 2}:I${rowIndex + 2}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [userData] }
                });
                console.log(`✅ Пользователь ${user.id} обновлен в Google Sheets`);
            }
            else {
                // Добавляем новую запись
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Пользователи!A2:I',
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [userData] }
                });
                console.log(`✅ Пользователь ${user.id} добавлен в Google Sheets`);
            }
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации пользователя:', error.message);
        }
    }
    // Синхронизация всех пользователей
    async syncAllUsers() {
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const users = await userRepository.find();
            const usersData = users.map((user) => [
                user.id,
                user.telegramId,
                user.firstName || '',
                user.username || '',
                user.stars,
                user.referralsCount || 0,
                user.createdAt.toISOString(),
                user.completedInitialSetup ? 'active' : 'pending'
            ]);
            // Очищаем лист и добавляем все данные
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A2:H',
            });
            if (usersData.length > 0) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Пользователи!A2:H',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: usersData }
                });
            }
            console.log(`✅ Синхронизировано ${users.length} пользователей`);
            return users.length;
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации всех пользователей:', error.message);
            return 0;
        }
    }
    // ============ ЛИСТ 2: ВЫПЛАТЫ ============
    async syncWithdrawal(withdrawal) {
        try {
            // Получаем пользователя
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const user = await userRepository.findOne({ where: { id: withdrawal.userId } });
            if (!user) {
                console.error('❌ Пользователь не найден для выплаты');
                return;
            }
            const withdrawalData = [
                withdrawal.id,
                user.telegramId,
                withdrawal.amount,
                withdrawal.status,
                withdrawal.createdAt.toISOString(),
                withdrawal.processedAt ? withdrawal.processedAt.toISOString() : '',
                withdrawal.wallet || 'user_data',
                '' // Комментарий (будет заполняться администратором)
            ];
            // Ищем выплату в таблице
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A2:H',
            });
            const rows = response.data.values || [];
            const rowIndex = rows.findIndex((row) => row[0] === withdrawal.id.toString());
            if (rowIndex !== -1) {
                // Обновляем существующую запись
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Выплаты!A${rowIndex + 2}:H${rowIndex + 2}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [withdrawalData] }
                });
                console.log(`✅ Выплата ${withdrawal.id} обновлена в Google Sheets`);
            }
            else {
                // Добавляем новую запись
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Выплаты!A2:H',
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: { values: [withdrawalData] }
                });
                console.log(`✅ Выплата ${withdrawal.id} добавлена в Google Sheets`);
            }
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации выплаты:', error.message);
        }
    }
    // Синхронизация всех выплат
    async syncAllWithdrawals() {
        try {
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const withdrawals = await withdrawalRepository.find({
                relations: ['user']
            });
            console.log(`📊 Найдено ${withdrawals.length} выплат в БД для синхронизации`);
            const withdrawalsData = withdrawals.map((withdrawal) => {
                const user = withdrawal.user;
                return [
                    withdrawal.id.toString(), // A: ID выплаты
                    user?.telegramId?.toString() || '', // B: Telegram ID
                    user?.username || '', // C: Username
                    user?.firstName || '', // D: Имя
                    withdrawal.amount.toString(), // E: Сумма (⭐)
                    withdrawal.status, // F: Статус
                    this.formatDate(withdrawal.createdAt), // G: Дата создания
                    withdrawal.processedAt ? this.formatDate(withdrawal.processedAt) : '', // H: Дата обработки
                    'НЕТ' // I: Уведомление отправлено
                ];
            });
            // ВАРИАНТ 1: Используем update() без предварительного clear()
            if (withdrawalsData.length > 0) {
                // Просто обновляем данные
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Выплаты!A2:I',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: withdrawalsData }
                });
                console.log(`📊 Первая выплата для примера:`, withdrawalsData[0]);
            }
            // ВАРИАНТ 2: Если нужно очистить лишние строки
            // Проверяем текущее количество строк
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A:I',
            });
            const existingRows = response.data.values || [];
            const currentRowCount = existingRows.length - 1; // минус заголовок
            if (currentRowCount > withdrawalsData.length) {
                // Очищаем только лишние строки
                const clearRange = `Выплаты!A${withdrawalsData.length + 2}:I${currentRowCount + 1}`;
                await this.sheets.spreadsheets.values.clear({
                    spreadsheetId: this.spreadsheetId,
                    range: clearRange,
                });
            }
            // ВОССТАНАВЛИВАЕМ ВАЛИДАЦИЮ (на всякий случай)
            await this.restoreSheetFormatting();
            console.log(`✅ Синхронизировано ${withdrawals.length} выплат`);
            return withdrawals.length;
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации всех выплат:', error.message);
            console.error('❌ Stack trace:', error.stack);
            return 0;
        }
    }
    async restoreSheetFormatting() {
        try {
            // Восстанавливаем условное форматирование
            await this.setupChipFormatting();
            // Также можно настроить другие форматы (ширину колонок и т.д.)
            await this.adjustColumnWidths();
            console.log('✅ Форматирование таблицы восстановлено');
        }
        catch (error) {
            console.error('❌ Ошибка восстановления форматирования:', error.message);
        }
    }
    async adjustColumnWidths() {
        try {
            const requests = [
                // ID выплаты
                {
                    updateDimensionProperties: {
                        range: {
                            sheetId: await this.getSheetId('Выплаты'),
                            dimension: 'COLUMNS',
                            startIndex: 0,
                            endIndex: 1
                        },
                        properties: {
                            pixelSize: 100
                        },
                        fields: 'pixelSize'
                    }
                },
                // Telegram ID
                {
                    updateDimensionProperties: {
                        range: {
                            sheetId: await this.getSheetId('Выплаты'),
                            dimension: 'COLUMNS',
                            startIndex: 1,
                            endIndex: 2
                        },
                        properties: {
                            pixelSize: 120
                        },
                        fields: 'pixelSize'
                    }
                },
                // Username
                {
                    updateDimensionProperties: {
                        range: {
                            sheetId: await this.getSheetId('Выплаты'),
                            dimension: 'COLUMNS',
                            startIndex: 2,
                            endIndex: 3
                        },
                        properties: {
                            pixelSize: 150
                        },
                        fields: 'pixelSize'
                    }
                },
                // Имя
                {
                    updateDimensionProperties: {
                        range: {
                            sheetId: await this.getSheetId('Выплаты'),
                            dimension: 'COLUMNS',
                            startIndex: 3,
                            endIndex: 4
                        },
                        properties: {
                            pixelSize: 120
                        },
                        fields: 'pixelSize'
                    }
                },
                // Сумма
                {
                    updateDimensionProperties: {
                        range: {
                            sheetId: await this.getSheetId('Выплаты'),
                            dimension: 'COLUMNS',
                            startIndex: 4,
                            endIndex: 5
                        },
                        properties: {
                            pixelSize: 100
                        },
                        fields: 'pixelSize'
                    }
                },
                // Статус
                {
                    updateDimensionProperties: {
                        range: {
                            sheetId: await this.getSheetId('Выплаты'),
                            dimension: 'COLUMNS',
                            startIndex: 5,
                            endIndex: 6
                        },
                        properties: {
                            pixelSize: 120
                        },
                        fields: 'pixelSize'
                    }
                }
            ];
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: { requests }
            });
        }
        catch (error) {
            console.error('❌ Ошибка настройки ширины колонок:', error);
        }
    }
    async getSheetId(sheetName) {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                fields: 'sheets.properties'
            });
            const sheet = spreadsheet.data.sheets?.find((s) => s.properties.title === sheetName);
            if (!sheet) {
                throw new Error(`Лист "${sheetName}" не найден`);
            }
            return sheet.properties.sheetId;
        }
        catch (error) {
            console.error('❌ Ошибка получения ID листа:', error.message);
            throw error;
        }
    }
    // ============ ЛИСТ 3: РЕФЕРАЛЫ ============
    async syncReferralSystem() {
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const users = await userRepository.find({
                where: { referrerId: (0, typeorm_1.Not)((0, typeorm_1.IsNull)()) }
            });
            const referralsData = await Promise.all(users.map(async (user) => {
                const referrer = user.referrerId
                    ? await userRepository.findOne({ where: { id: user.referrerId } })
                    : null;
                return [
                    user.telegramId,
                    referrer?.telegramId || user.referrerId,
                    1, // Уровень (всегда 1 для простоты)
                    user.createdAt.toISOString(),
                    user.stars // Баланс пользователя
                ];
            }));
            // Очищаем лист и добавляем все данные
            await this.sheets.spreadsheets.values.clear({
                spreadsheetId: this.spreadsheetId,
                range: 'Рефералы!A2:E',
            });
            if (referralsData.length > 0) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Рефералы!A2:E',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: referralsData }
                });
            }
            console.log(`✅ Синхронизировано ${referralsData.length} реферальных связей`);
            return referralsData.length;
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации реферальной системы:', error.message);
            return 0;
        }
    }
    async syncUserStatusFromSheets() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A2:I', // Читаем до I колонки (колонка H - статус)
            });
            const rows = response.data.values || [];
            console.log(`📊 Найдено ${rows.length} строк в таблице пользователей`);
            // Для отладки выведите первые 3 строки
            if (rows.length > 0) {
                console.log('Первые строки таблицы:');
                for (let i = 0; i < Math.min(3, rows.length); i++) {
                    console.log(`Строка ${i + 2}:`, rows[i]);
                    console.log(`  ID: ${rows[i][0]}, Статус (колонка H): "${rows[i][7]}"`);
                }
            }
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            let updatedCount = 0;
            for (const row of rows) {
                const [id, , , , , , , status] = row;
                // Пропускаем пустые строки
                if (!id || !status)
                    continue;
                const userId = parseInt(id);
                if (isNaN(userId))
                    continue;
                const user = await userRepository.findOne({
                    where: { id: userId }
                });
                if (user) {
                    const normalizedStatus = this.normalizeUserStatus(status);
                    console.log(`🔍 Проверка пользователя ${userId}: статус в таблице "${status}" → нормализован "${normalizedStatus}", текущий в БД "${user.status}"`);
                    if (normalizedStatus && user.status !== normalizedStatus) {
                        console.log(`🔄 Обновление статуса пользователя ${userId}: ${user.status} → ${normalizedStatus}`);
                        user.status = normalizedStatus;
                        await userRepository.save(user);
                        updatedCount++;
                    }
                }
            }
            if (updatedCount > 0) {
                console.log(`✅ Обновлены статусы ${updatedCount} пользователей из Google Sheets`);
            }
            else {
                console.log('📊 Статусы пользователей актуальны');
            }
            return updatedCount;
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации статусов:', error.message);
            return 0;
        }
    }
    // Метод для нормализации статуса пользователя
    normalizeUserStatus(status) {
        if (!status)
            return null;
        const statusLower = status.toLowerCase().trim();
        if (statusLower === 'active' || statusLower === 'активен' || statusLower === 'активный') {
            return 'active';
        }
        if (statusLower === 'blocked' || statusLower === 'заблокирован' || statusLower === 'заблокирован') {
            return 'blocked';
        }
        if (statusLower === 'pending' || statusLower === 'ожидание' || statusLower === 'в ожидании') {
            return 'pending';
        }
        console.log(`⚠️ Неизвестный статус пользователя: "${status}"`);
        return null;
    }
    async setupAllFormatting() {
        try {
            await this.setupChipFormatting(); // Для статусов выплат
            await this.setupUserStatusFormatting(); // Для статусов пользователей
            console.log('✅ Все форматирования настроены');
        }
        catch (error) {
            console.error('❌ Ошибка настройки форматирований:', error.message);
        }
    }
    async setupUserStatusFormatting() {
        try {
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                fields: 'sheets.properties'
            });
            const sheet = spreadsheet.data.sheets?.find((s) => s.properties.title === 'Пользователи');
            if (!sheet) {
                console.error('❌ Лист "Пользователи" не найден');
                return;
            }
            const sheetId = sheet.properties.sheetId;
            // Условное форматирование для статусов пользователей
            const requests = [
                // active - зеленый
                {
                    addConditionalFormatRule: {
                        rule: {
                            ranges: [{
                                    sheetId: sheetId,
                                    startRowIndex: 1,
                                    endRowIndex: 1000,
                                    startColumnIndex: 7, // Колонка H (статус)
                                    endColumnIndex: 8
                                }],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_EQ',
                                    values: [{ userEnteredValue: 'active' }]
                                },
                                format: {
                                    backgroundColor: { red: 0.85, green: 0.96, blue: 0.87 },
                                    textFormat: {
                                        foregroundColor: { red: 0.15, green: 0.55, blue: 0.27 },
                                        bold: true
                                    }
                                }
                            }
                        },
                        index: 0
                    }
                },
                // blocked - красный
                {
                    addConditionalFormatRule: {
                        rule: {
                            ranges: [{
                                    sheetId: sheetId,
                                    startRowIndex: 1,
                                    endRowIndex: 1000,
                                    startColumnIndex: 7,
                                    endColumnIndex: 8
                                }],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_EQ',
                                    values: [{ userEnteredValue: 'blocked' }]
                                },
                                format: {
                                    backgroundColor: { red: 0.96, green: 0.87, blue: 0.87 },
                                    textFormat: {
                                        foregroundColor: { red: 0.75, green: 0.22, blue: 0.22 },
                                        bold: true
                                    }
                                }
                            }
                        },
                        index: 1
                    }
                },
                // pending - желтый/оранжевый
                {
                    addConditionalFormatRule: {
                        rule: {
                            ranges: [{
                                    sheetId: sheetId,
                                    startRowIndex: 1,
                                    endRowIndex: 1000,
                                    startColumnIndex: 7,
                                    endColumnIndex: 8
                                }],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_EQ',
                                    values: [{ userEnteredValue: 'pending' }]
                                },
                                format: {
                                    backgroundColor: { red: 1.0, green: 0.95, blue: 0.8 },
                                    textFormat: {
                                        foregroundColor: { red: 0.8, green: 0.6, blue: 0.2 },
                                        bold: true
                                    }
                                }
                            }
                        },
                        index: 2
                    }
                }
            ];
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: { requests }
            });
            console.log('✅ Стили статусов пользователей настроены');
        }
        catch (error) {
            console.error('❌ Ошибка настройки стилей статусов:', error.message);
        }
    }
    async syncAllUsersWithoutOverwrite() {
        try {
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const users = await userRepository.find();
            // Сначала получаем текущие данные из таблицы
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A2:H', // Все колонки
            });
            const rows = response.data.values || [];
            // Создаем мап для быстрого поиска существующих пользователей
            const existingUsers = new Map();
            rows.forEach((row) => {
                if (row[0]) {
                    existingUsers.set(row[0], row);
                }
            });
            // Обновляем только тех пользователей, которых нет в таблице
            const usersToAdd = users.filter(user => !existingUsers.has(user.id.toString()));
            if (usersToAdd.length === 0) {
                console.log('📊 Все пользователи уже в таблице');
                return 0;
            }
            const usersData = usersToAdd.map((user) => [
                user.id,
                user.telegramId,
                user.firstName || '',
                user.username || '',
                user.stars,
                user.referralsCount || 0,
                user.createdAt.toISOString(),
                user.completedInitialSetup ? 'active' : 'pending'
            ]);
            // Добавляем только новых пользователей
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A2:H',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: usersData }
            });
            console.log(`✅ Добавлено ${usersToAdd.length} новых пользователей в Google Sheets`);
            return usersToAdd.length;
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации пользователей без перезаписи:', error.message);
            return 0;
        }
    }
    async bidirectionalSync() {
        console.log('🔄 Двусторонняя синхронизация...');
        // 1. Сначала из БД → Google Таблицы (но НЕ перезаписывать балансы)
        const usersCount = await this.syncAllUsersWithoutOverwrite(); // ← Новый метод!
        const withdrawalsCount = await this.syncNewWithdrawalsOnly();
        const referralsCount = await this.syncReferralSystem();
        // 2. Затем из Google Таблицы → БД (только для обновлений)
        const updatedWithdrawals = await this.checkAndUpdateWithdrawals();
        const updatedBalances = await this.syncUserBalanceFromSheets(); // ← Теперь это обновит БД
        const updatedStatuses = await this.syncUserStatusFromSheets();
        console.log(`✅ Двусторонняя синхронизация завершена:
       → В таблицы: ${usersCount} пользователей, ${withdrawalsCount} выплат, ${referralsCount} рефералов
       ← Из таблиц: ${updatedWithdrawals} выплат, ${updatedBalances} балансов, ${updatedStatuses} статусов`);
        return { usersCount, withdrawalsCount, referralsCount };
    }
    // ============ ОБНОВЛЕНИЕ СТАТУСА ВЫПЛАТЫ ИЗ GOOGLE SHEETS ============
    async checkAndUpdateWithdrawals() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A2:I', // A-I: ID, Telegram ID, Username, Имя, Сумма, Статус, Дата создания, Дата обработки, Уведомление
            });
            const rows = response.data.values || [];
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            let updatedCount = 0;
            for (const row of rows) {
                const [id, telegramIdStr, username, firstName, amountStr, status, , , adminComment] = row;
                // Пропускаем если ID пустой
                if (!id || id.trim() === '')
                    continue;
                const withdrawalId = parseInt(id);
                if (isNaN(withdrawalId))
                    continue;
                // НОРМАЛИЗУЕМ СТАТУС - важно!
                const normalizedStatus = this.normalizeStatus(status);
                if (!normalizedStatus) {
                    console.log(`⚠️ Пропускаем выплату ${id}: неверный статус "${status}"`);
                    continue;
                }
                const withdrawal = await withdrawalRepository.findOne({
                    where: { id: withdrawalId }
                });
                if (withdrawal && withdrawal.status !== normalizedStatus) {
                    console.log(`🔄 Статус выплаты ${id} изменен: ${withdrawal.status} → ${normalizedStatus}`);
                    // Сохраняем старый статус
                    const oldStatus = withdrawal.status;
                    // Обновляем статус
                    withdrawal.status = normalizedStatus;
                    // Устанавливаем дату обработки только если статус approved/rejected
                    if ((normalizedStatus === 'approved' || normalizedStatus === 'rejected') && !withdrawal.processedAt) {
                        withdrawal.processedAt = new Date();
                    }
                    await withdrawalRepository.save(withdrawal);
                    updatedCount++;
                    // УВЕДОМЛЯЕМ ПОЛЬЗОВАТЕЛЯ ОБ ИЗМЕНЕНИИ СТАТУСА
                    await this.notifyUserAboutWithdrawalStatusChange(withdrawal, oldStatus, normalizedStatus, adminComment, parseInt(amountStr), username, firstName);
                }
            }
            return updatedCount;
        }
        catch (error) {
            console.error('❌ Ошибка проверки статусов выплат:', error.message);
            return 0;
        }
    }
    // В методе notifyUserAboutWithdrawalStatusChange:
    async notifyUserAboutWithdrawalStatusChange(withdrawal, oldStatus, newStatus, adminComment = '', amount, username, firstName) {
        try {
            // Получаем экземпляр бота из глобальной области
            const botInstance = global.botInstance;
            if (!botInstance || !botInstance.bot || !botInstance.bot.telegram) {
                console.error('❌ Bot instance not found or invalid for notification');
                return;
            }
            // Находим пользователя по telegramId из withdrawal
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const user = await userRepository.findOne({
                where: { telegramId: withdrawal.telegramId }
            });
            if (!user) {
                console.error(`❌ User not found for withdrawal #${withdrawal.id}, telegramId: ${withdrawal.telegramId}`);
                return;
            }
            let message = '';
            let keyboard = undefined;
            if (newStatus === 'approved' || newStatus === 'completed') {
                message =
                    `✅ *Заявка на вывод #${withdrawal.id} ОДОБРЕНА!*\n\n` +
                        `💰 Сумма: ${amount} ⭐\n` +
                        `📅 Дата обработки: ${new Date().toLocaleString('ru-RU')}\n` +
                        `👤 Обработано администратором\n\n`;
                if (adminComment && adminComment.trim() !== '') {
                    message += `💬 Комментарий администратора:\n${adminComment}\n\n`;
                }
                message += `🎉 Средства будут переведены в ближайшее время.\n` +
                    `📞 Для уточнений свяжитесь с поддержкой.`;
            }
            else if (newStatus === 'rejected') {
                message =
                    `❌ *Заявка на вывод #${withdrawal.id} ОТКЛОНЕНА!*\n\n` +
                        `💰 Сумма: ${amount} ⭐\n` +
                        `📅 Дата отказа: ${new Date().toLocaleString('ru-RU')}\n` +
                        `👤 Отклонено администратором\n\n`;
                if (adminComment && adminComment.trim() !== '') {
                    message += `💬 Причина отказа:\n${adminComment}\n\n`;
                }
                else {
                    message += `💬 Причина отказа: не указана\n\n`;
                }
                message += `💰 *Средства возвращены на ваш баланс!*\n` +
                    `📊 Новый баланс: ${user.stars + amount} ⭐\n\n` +
                    `⚠️ Вы можете создать новую заявку с правильными данными.`;
                // Возвращаем средства пользователю
                user.stars += amount;
                await userRepository.save(user);
                keyboard = {
                    inline_keyboard: [[
                            { text: '💰 Создать новую заявку', callback_data: 'withdraw' },
                            { text: '🏠 В меню', callback_data: 'back_to_menu' }
                        ]]
                };
            }
            else if (newStatus === 'processing') {
                message =
                    `🔄 *Заявка на вывод #${withdrawal.id} в обработке!*\n\n` +
                        `💰 Сумма: ${amount} ⭐\n` +
                        `⏳ Статус: Администратор проверяет заявку\n` +
                        `📅 Начало обработки: ${new Date().toLocaleString('ru-RU')}\n\n` +
                        `⏰ Обычно обработка занимает до 24 часов.\n` +
                        `📞 Для ускорения свяжитесь с администратором.`;
            }
            else if (newStatus === 'pending') {
                // Ничего не делаем, это начальный статус
                return;
            }
            // Отправляем уведомление пользователю через бота
            try {
                await botInstance.bot.telegram.sendMessage(user.telegramId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                console.log(`✅ User ${user.telegramId} notified about withdrawal #${withdrawal.id} status: ${oldStatus} → ${newStatus}`);
            }
            catch (sendError) {
                console.error(`❌ Error sending notification to user ${user.telegramId}:`, sendError.message);
            }
            // Обновляем колонку "Уведомление" в Google Sheets
            await this.markAsNotified(withdrawal.id);
        }
        catch (error) {
            console.error(`❌ Error in notifyUserAboutWithdrawalStatusChange for withdrawal #${withdrawal.id}:`, error.message);
        }
    }
    // Метод для отметки в Google Sheets, что уведомление отправлено
    async markAsNotified(withdrawalId) {
        try {
            // Находим строку с нужной выплатой
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Выплаты!A2:I',
            });
            const rows = response.data.values || [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (parseInt(row[0]) === withdrawalId) {
                    // Обновляем колонку I (Уведомление)
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: `Выплаты!I${i + 2}`, // +2 потому что A2 начало
                        valueInputOption: 'USER_ENTERED',
                        requestBody: {
                            values: [['✅ Уведомлено']]
                        }
                    });
                    console.log(`✅ Marked withdrawal #${withdrawalId} as notified in Google Sheets`);
                    break;
                }
            }
        }
        catch (error) {
            console.error(`❌ Error marking withdrawal #${withdrawalId} as notified:`, error);
        }
    }
    // Улучшенный normalizeStatus:
    normalizeStatus(status) {
        if (!status)
            return null;
        const cleanStatus = status.toLowerCase().trim();
        // Ищем ключевые слова в любом месте строки
        if (cleanStatus.includes('approved') || cleanStatus.includes('одобрено')) {
            return 'approved';
        }
        if (cleanStatus.includes('rejected') || cleanStatus.includes('отклонено')) {
            return 'rejected';
        }
        if (cleanStatus.includes('pending') || cleanStatus.includes('ожидание')) {
            return 'pending';
        }
        console.log(`⚠️ Неизвестный статус: "${status}"`);
        return null;
    }
    async syncUserBalanceFromSheets() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A2:E', // ID, Telegram ID, Имя, Username, Баланс
            });
            const rows = response.data.values || [];
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            let updatedCount = 0;
            for (const row of rows) {
                const [id, telegramId, , , balanceStr] = row;
                // Пропускаем пустые строки
                if (!id || !balanceStr)
                    continue;
                const userId = parseInt(id);
                if (isNaN(userId))
                    continue;
                const newBalance = parseInt(balanceStr);
                if (isNaN(newBalance))
                    continue;
                // Находим пользователя
                const user = await userRepository.findOne({
                    where: { id: userId }
                });
                if (user && user.stars !== newBalance) {
                    console.log(`🔄 Обновление баланса пользователя ${userId} (${user.username || 'без username'}): ${user.stars} → ${newBalance}`);
                    user.stars = newBalance;
                    await userRepository.save(user);
                    updatedCount++;
                }
            }
            if (updatedCount > 0) {
                console.log(`✅ Обновлены балансы ${updatedCount} пользователей из Google Sheets`);
            }
            else {
                console.log('📊 Балансы пользователей актуальны');
            }
            return updatedCount;
        }
        catch (error) {
            console.error('❌ Ошибка синхронизации балансов:', error.message);
            return 0;
        }
    }
    // ============ ПОЛНАЯ СИНХРОНИЗАЦИЯ ============
    async fullSync() {
        console.log('🔄 Начало полной синхронизации с Google Sheets...');
        const usersCount = await this.syncAllUsers();
        const withdrawalsCount = await this.syncAllWithdrawals();
        const referralsCount = await this.syncReferralSystem();
        console.log(`✅ Полная синхронизация завершена. ` +
            `Пользователей: ${usersCount}, ` +
            `Выплат: ${withdrawalsCount}, ` +
            `Рефералов: ${referralsCount}`);
        return { usersCount, withdrawalsCount, referralsCount };
    }
    // ============ УВЕДОМЛЕНИЯ ============
    async notifyUserAboutWithdrawalStatus(withdrawalId, status, comment) {
        try {
            const withdrawalRepository = data_source_1.AppDataSource.getRepository(Withdrawal_1.Withdrawal);
            const userRepository = data_source_1.AppDataSource.getRepository(User_1.User);
            const withdrawal = await withdrawalRepository.findOne({
                where: { id: withdrawalId }
            });
            if (!withdrawal)
                return;
            const user = await userRepository.findOne({
                where: { id: withdrawal.userId }
            });
            if (!user)
                return;
            let message = '';
            if (status === 'approved') {
                message = `✅ Ваша заявка на вывод #${withdrawalId} одобрена!\n💰 Сумма: ${withdrawal.amount} ⭐`;
            }
            else if (status === 'rejected') {
                message = `❌ Ваша заявка на вывод #${withdrawalId} отклонена.\n💰 Сумма: ${withdrawal.amount} ⭐`;
                if (comment && comment.trim() !== '') {
                    message += `\n📝 Причина: ${comment}`;
                }
            }
            if (message) {
                console.log(`📨 Уведомление для пользователя ${user.telegramId}: ${message}`);
                // Здесь можно отправить сообщение пользователю через бота
                // await this.bot.telegram.sendMessage(user.telegramId, message);
            }
        }
        catch (error) {
            console.error('❌ Ошибка отправки уведомления:', error.message);
        }
    }
}
exports.GoogleSheetsService = GoogleSheetsService;
