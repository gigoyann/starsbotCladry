"use strict";
// import axios from 'axios';
// import * as fs from 'fs';
// import * as path from 'path';
// export class CaptchaService {
//     private imagesDir: string;
//     constructor() {
//         this.imagesDir = path.join(__dirname, '../../public/captcha');
//         this.ensureDirExists();
//     }
//     private ensureDirExists(): void {
//         if (!fs.existsSync(this.imagesDir)) {
//             fs.mkdirSync(this.imagesDir, { recursive: true });
//         }
//     }
//     async generateImageCaptcha(): Promise<{ imageUrl: string, correctAnswer: string }> {
//         // Можно использовать простые объекты
//         const objects = ['🐱', '🐶', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯'];
//         const correctObject = objects[Math.floor(Math.random() * objects.length)];
//         // Генерируем случайный набор объектов
//         const options = [];
//         while (options.length < 4) {
//             const obj = objects[Math.floor(Math.random() * objects.length)];
//             if (!options.includes(obj)) {
//                 options.push(obj);
//             }
//         }
//         // Заменяем один случайный элемент правильным ответом
//         const correctIndex = Math.floor(Math.random() * 4);
//         options[correctIndex] = correctObject;
//         // Создаем текстовое представление
//         const captchaText = `Выберите: ${correctObject}\n\n` +
//             options.map((obj, i) => `${i + 1}. ${obj}`).join('\n');
//         return {
//             imageUrl: '', // Можно оставить пустым или сгенерировать картинку
//             correctAnswer: (correctIndex + 1).toString()
//         };
//     }
// }
