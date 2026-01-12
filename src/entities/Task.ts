import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { UserTask } from './UserTask';

export type TaskType = 'channel_subscription' | 'referral_click' | 'bot_subscription';
export type TaskStatus = 'active' | 'inactive' | 'completed';

@Entity('tasks')
export class Task {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    title: string;

    @Column('text')
    description: string;

    @Column({ type: 'enum', enum: ['channel_subscription', 'referral_click', 'bot_subscription'], default: 'channel_subscription' })
    type: TaskType;

    @Column()
    reward: number; // Количество звезд за выполнение

    @Column({ nullable: true })
    targetUrl: string; // Для реферальных заданий

    @Column({ nullable: true })
    channelUsername: string; // Для подписок на каналы (@username)

    @Column({ nullable: true })
    botUsername: string; // Для подписок на ботов

    @Column({ nullable: true })
    inviteLink: string; // Пригласительная ссылка

    @Column({ default: 1 })
    maxCompletions: number; // Максимальное количество выполнений одним пользователем

    @Column({ default: 0 })
    totalCompletions: number; // Общее количество выполнений

    @Column({ type: 'enum', enum: ['active', 'inactive', 'completed'], default: 'active' })
    status: TaskStatus;

    @Column({ default: true })
    isAvailable: boolean;

    @Column({ nullable: true })
    expirationDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => UserTask, userTask => userTask.task)
    userTasks: UserTask[];
}