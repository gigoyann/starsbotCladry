// src/entities/User.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    @Index()
    telegramId: number;

    @Column({ nullable: true })
    username: string;

    @Column({ nullable: true })
    firstName: string;

    @Column({ nullable: true })
    lastName: string;

    @Column({ default: 0 })
    stars: number;

    @Column({ default: 0, name: 'totalEarned' })
    totalEarned: number;

    @Column({ nullable: true, name: 'selectedEmoji' })
    selectedEmoji: string;

    @Column({ default: false, name: 'subscribedToChannels' })
    subscribedToChannels: boolean;

    @Column({ default: false, name: 'completedInitialSetup' })
    completedInitialSetup: boolean;

    @Column({ nullable: true, name: 'referrerId' })
    @Index()
    referrerId: number;

    @Column({ default: 0, name: 'referralsCount' })
    referralsCount: number;

    @Column('text', { array: true, nullable: true, name: 'referralLinks' })
    referralLinks: string[];

    // Добавляем поле статуса
    @Column({
        type: 'varchar',
        default: 'active',
        name: 'status'
    })
    status: 'active' | 'blocked' | 'pending';

    @CreateDateColumn({ name: 'createdAt' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updatedAt' })
    updatedAt: Date;

    // Helper методы
    isBlocked(): boolean {
        return this.status === 'blocked';
    }

    isActive(): boolean {
        return this.status === 'active';
    }
}