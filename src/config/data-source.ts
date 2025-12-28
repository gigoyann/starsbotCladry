import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../entities/User';
import { Withdrawal } from '../entities/Withdrawal';
import { Game } from '../entities/Game';
import { Captcha } from '../entities/Captcha';

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
    entities: [User, Withdrawal, Game, Captcha],
    migrations: ['dist/migrations/*.js'], // <- путь к скомпилированным JS
    subscribers: [],
});