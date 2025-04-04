import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function build() {
    try {
        // 确保dist目录存在
        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist');
        }

        // 确保dist/public目录存在
        if (!fs.existsSync('dist/public')) {
            fs.mkdirSync('dist/public', { recursive: true });
        }

        // 复制前端文件
        fs.cpSync('src/public', 'dist/public', { recursive: true });
        
        // 复制后端文件
        fs.cpSync('src/server.js', 'dist/server.js');
        
        // 构建完成
    } catch (error) {
        console.error('构建失败:', error);
        process.exit(1);
    }
}

build(); 