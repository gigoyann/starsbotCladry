import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Task } from './Task';

@Entity('user_tasks')
export class UserTask {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'userId' })
    userId: number;

    @Column({ name: 'taskId' })
    taskId: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @ManyToOne(() => Task)
    @JoinColumn({ name: 'taskId' })
    task: Task;

    @Column()
    status: string;

    @Column({ name: 'completedAt', nullable: true })
    completedAt: Date;

    @Column({ default: 0 })
    attempts: number;

    @Column({ name: 'clickTime', nullable: true })
    clickTime: Date;

    @Column({ name: 'completionTime', nullable: true })
    completionTime: Date;

    @Column({ name: 'referralClickId', nullable: true })
    referralClickId: string;

    @CreateDateColumn({ name: 'createdAt' })
    createdAt: Date;

    @Column({ name: 'expiredAt', nullable: true })
    expiredAt: Date;

    @Column({ name: 'verificationData', type: 'simple-json', nullable: true })
    verificationData: any;
}