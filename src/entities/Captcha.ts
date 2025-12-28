// src/entities/Captcha.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('captchas')
@Index(['userId'])
@Index(['solved'])
@Index(['expiresAt'])
export class Captcha {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'bigint' })
    userId: number;

    @Column()
    question: string;

    @Column()
    answer: string;

    @Column({ default: false })
    solved: boolean;

    @Column({ nullable: true })
    userAnswer?: string;

    @Column({ default: 0 })
    attempts: number;

    @Column({ default: 'math' })
    type: string;

    @Column('text', { nullable: true, array: true })
    options?: string[];

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: 'timestamp', nullable: true })
    solvedAt: Date | null;

    @Column({ type: 'timestamp', nullable: true })
    expiresAt: Date | null;
}