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
exports.User = void 0;
// src/entities/User.ts
const typeorm_1 = require("typeorm");
let User = class User {
    // Helper методы
    isBlocked() {
        return this.status === 'blocked';
    }
    isActive() {
        return this.status === 'active';
    }
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], User.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Number)
], User.prototype, "telegramId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "firstName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], User.prototype, "lastName", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "stars", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, name: 'totalEarned' }),
    __metadata("design:type", Number)
], User.prototype, "totalEarned", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, name: 'selectedEmoji' }),
    __metadata("design:type", String)
], User.prototype, "selectedEmoji", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'subscribedToChannels' }),
    __metadata("design:type", Boolean)
], User.prototype, "subscribedToChannels", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false, name: 'completedInitialSetup' }),
    __metadata("design:type", Boolean)
], User.prototype, "completedInitialSetup", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, name: 'referrerId' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Number)
], User.prototype, "referrerId", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0, name: 'referralsCount' }),
    __metadata("design:type", Number)
], User.prototype, "referralsCount", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { array: true, nullable: true, name: 'referralLinks' }),
    __metadata("design:type", Array)
], User.prototype, "referralLinks", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'varchar',
        default: 'active',
        name: 'status'
    }),
    __metadata("design:type", String)
], User.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'createdAt' }),
    __metadata("design:type", Date)
], User.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updatedAt' }),
    __metadata("design:type", Date)
], User.prototype, "updatedAt", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('users')
], User);
