import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

@Entity('games')
export class Game {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'bigint' })
    userId: number;
    
    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    gameType: string;

    @Column()
    betAmount: number;

    @Column()
    winAmount: number;

    @Column()
    result: 'win' | 'loss';

    @CreateDateColumn()
    createdAt: Date;
}