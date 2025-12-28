// src/entities/Withdrawal.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

@Entity('withdrawals')
export class Withdrawal {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'bigint' })
    userId: number;


    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })

    user: User;

    @Column()
    amount: number;

    @Column({ default: 'user_data' })
    wallet: string;

    @Column({ default: 'pending' })
    status: 'pending' | 'approved' | 'rejected';

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    processedAt: Date | null;

    @Column({ nullable: true })
    username?: string;

    @Column({ nullable: true })
    firstName?: string;

    @Column({ nullable: true })
    lastName?: string;

    @Column({ nullable: true })
    telegramId?: number;
}