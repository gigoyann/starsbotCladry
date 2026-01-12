import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';
import { Task } from './Task';

@Entity('task_clicks')
export class TaskClick {
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

    @Column({ name: 'clickId' })
    clickId: string;

    @Column()
    status: string;

    @Column({ name: 'clickTime' })
    clickTime: Date;

    @Column({ name: 'completionTime', nullable: true })
    completionTime: Date;

    @CreateDateColumn({ name: 'createdAt' })
    createdAt: Date;

    @Column({ name: 'expiresAt' })
    expiresAt: Date;
}