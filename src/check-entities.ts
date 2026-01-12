import 'reflect-metadata';
import { AppDataSource } from './config/data-source';

async function checkEntities() {
    console.log('🔍 Проверка сущностей TypeORM...\n');
    
    try {
        // Пытаемся подключиться к базе данных
        if (!AppDataSource.isInitialized) {
            console.log('🔄 Инициализация подключения к базе данных...');
            await AppDataSource.initialize();
        }
        
        console.log('✅ База данных подключена\n');
        
        // Получаем метаданные сущностей
        const entityMetadatas = AppDataSource.entityMetadatas;
        console.log(`📊 Всего зарегистрированных сущностей: ${entityMetadatas.length}\n`);
        
        // Выводим информацию о каждой сущности
        console.log('📋 Список сущностей:');
        console.log('='.repeat(50));
        
        entityMetadatas.forEach((metadata, index) => {
            console.log(`${index + 1}. ${metadata.name}`);
            console.log(`   📊 Таблица: ${metadata.tableName}`);
            console.log(`   🔑 Столбцы: ${metadata.columns.length}`);
            
            // Проверяем связи
            if (metadata.relations.length > 0) {
                console.log(`   🔗 Связи: ${metadata.relations.length}`);
                metadata.relations.forEach(relation => {
                    console.log(`      • ${relation.propertyName} -> ${relation.type}`);
                });
            }
            
            console.log('');
        });
        
        console.log('='.repeat(50));
        
        // Проверяем конкретные сущности для системы заданий
        console.log('\n🔍 Проверка сущностей системы заданий:');
        console.log('-'.repeat(50));
        
        const entitiesToCheck = ['Task', 'UserTask', 'TaskClick'];
        
        for (const entityName of entitiesToCheck) {
            const entity = entityMetadatas.find(m => m.name === entityName);
            if (entity) {
                console.log(`✅ ${entityName}: найдена (таблица: ${entity.tableName})`);
                
                // Проверяем, есть ли таблица в базе данных
                try {
                    const tableExists = await AppDataSource.query(
                        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${entity.tableName}')`
                    );
                    
                    if (tableExists[0].exists) {
                        console.log(`   📊 Таблица существует в базе данных`);
                        
                        // Получаем количество записей
                        const countResult = await AppDataSource.query(
                            `SELECT COUNT(*) as count FROM "${entity.tableName}"`
                        );
                        console.log(`   📈 Записей в таблице: ${countResult[0]?.count || 0}`);
                    } else {
                        console.log(`   ❌ Таблица не существует в базе данных!`);
                    }
                } catch (error) {
                    console.log(`   ⚠️ Ошибка проверки таблицы: ${error}`);
                }
                
            } else {
                console.log(`❌ ${entityName}: НЕ найдена в метаданных TypeORM!`);
            }
            console.log('');
        }
        
        // Проверяем существующие таблицы в базе данных
        console.log('\n📊 Существующие таблицы в базе данных:');
        console.log('-'.repeat(50));
        
        const tables = await AppDataSource.query(`
            SELECT table_name, table_schema 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        tables.forEach((table: any, index: number) => {
            console.log(`${index + 1}. ${table.table_name}`);
        });
        
        // Проверяем таблицу tasks
        console.log('\n🔍 Проверка таблицы tasks:');
        const tasksInfo = await AppDataSource.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'tasks'
            ORDER BY ordinal_position
        `);
        
        if (tasksInfo.length > 0) {
            console.log('Структура таблицы tasks:');
            tasksInfo.forEach((col: any) => {
                console.log(`   • ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
            });
            
            // Проверяем CHECK constraints
            const constraints = await AppDataSource.query(`
                SELECT conname, pg_get_constraintdef(c.oid) as definition
                FROM pg_constraint c
                JOIN pg_class t ON c.conrelid = t.oid
                WHERE t.relname = 'tasks'
                AND contype = 'c'
            `);
            
            if (constraints.length > 0) {
                console.log('\nCHECK constraints таблицы tasks:');
                constraints.forEach((constraint: any) => {
                    console.log(`   • ${constraint.conname}: ${constraint.definition}`);
                });
            }
        }
        
        console.log('\n✅ Проверка завершена!\n');
        
    } catch (error: any) {
        console.error('❌ Ошибка при проверке сущностей:');
        console.error(`   Сообщение: ${error.message}`);
        console.error(`   Код: ${error.code || 'N/A'}`);
        
        if (error.driverError) {
            console.error(`   Ошибка драйвера: ${error.driverError.message}`);
        }
        
        console.error('\n📋 Stack trace:');
        console.error(error.stack);
        
    } finally {
        // Закрываем соединение
        if (AppDataSource.isInitialized) {
            await AppDataSource.destroy();
            console.log('🔌 Соединение с базой данных закрыто');
        }
    }
}

// Запускаем проверку
checkEntities().catch(console.error);