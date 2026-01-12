"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskClick = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
const Task_1 = require("./Task");
let TaskClick = class TaskClick {
};
exports.TaskClick = TaskClick;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], TaskClick.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'userId' }),
    __metadata("design:type", Number)
], TaskClick.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'taskId' }),
    __metadata("design:type", Number)
], TaskClick.prototype, "taskId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User),
    (0, typeorm_1.JoinColumn)({ name: 'userId' }),
    __metadata("design:type", User_1.User)
], TaskClick.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Task_1.Task),
    (0, typeorm_1.JoinColumn)({ name: 'taskId' }),
    __metadata("design:type", Task_1.Task)
], TaskClick.prototype, "task", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'clickId' }),
    __metadata("design:type", String)
], TaskClick.prototype, "clickId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], TaskClick.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'clickTime' }),
    __metadata("design:type", Date)
], TaskClick.prototype, "clickTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'completionTime', nullable: true }),
    __metadata("design:type", Date)
], TaskClick.prototype, "completionTime", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'createdAt' }),
    __metadata("design:type", Date)
], TaskClick.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'expiresAt' }),
    __metadata("design:type", Date)
], TaskClick.prototype, "expiresAt", void 0);
exports.TaskClick = TaskClick = __decorate([
    (0, typeorm_1.Entity)('task_clicks')
], TaskClick);
