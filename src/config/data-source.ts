import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../entities/User';
import { Withdrawal } from '../entities/Withdrawal';
import { Game } from '../entities/Game';
import { Captcha } from '../entities/Captcha';
import { Task } from '../entities/Task';
import { UserTask } from '../entities/UserTask';
import { TaskClick } from '../entities/TaskClick';

dotenv.config();

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'bot_star_db',
    synchronize: false,
    logging: process.env.NODE_ENV !== 'production',
    entities: [User,
        Withdrawal,
        Game,
        Captcha,
        Task,          // добавляем
        UserTask,      // добавляем  
        TaskClick],
    migrations: ['dist/migrations/*.js'], // <- путь к скомпилированным JS
    subscribers: [],
});