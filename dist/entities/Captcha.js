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
exports.Captcha = void 0;
// src/entities/Captcha.ts
const typeorm_1 = require("typeorm");
let Captcha = class Captcha {
};
exports.Captcha = Captcha;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Captcha.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'bigint' }),
    __metadata("design:type", Number)
], Captcha.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Captcha.prototype, "question", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Captcha.prototype, "answer", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Captcha.prototype, "solved", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Captcha.prototype, "userAnswer", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Captcha.prototype, "attempts", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 'math' }),
    __metadata("design:type", String)
], Captcha.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true, array: true }),
    __metadata("design:type", Array)
], Captcha.prototype, "options", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Captcha.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], Captcha.prototype, "solvedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'timestamp', nullable: true }),
    __metadata("design:type", Object)
], Captcha.prototype, "expiresAt", void 0);
exports.Captcha = Captcha = __decorate([
    (0, typeorm_1.Entity)('captchas'),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['solved']),
    (0, typeorm_1.Index)(['expiresAt'])
], Captcha);
