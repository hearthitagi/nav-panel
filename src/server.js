import express from 'express';
import Docker from 'dockerode';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import fs from 'fs';
import cors from 'cors';
import basicAuth from 'express-basic-auth';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import fetch from 'node-fetch';
import jsdom from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 根据操作系统选择 Docker socket 路径
const dockerSocketPath = os.platform() === 'win32' 
    ? '//./pipe/docker_engine'  // Windows 路径
    : '/var/run/docker.sock';   // Linux/Mac 路径

const docker = new Docker({ 
    socketPath: dockerSocketPath,
    timeout: 30000, // 增加超时时间到 30 秒
    version: 'v1.41', // 使用固定的 API 版本
    protocol: 'http' // 明确指定协议
});

const app = express();

// 启用 CORS
app.use(cors());

// 提供静态文件服务
app.use(express.static(path.join(__dirname, 'public'), {
    index: false, // 禁用默认的 index 文件
    setHeaders: (res, path) => {
        res.set('Cache-Control', 'no-store');
    }
}));

app.use(express.json());

// 配置文件路径
const CONFIG_PATH = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
    ? path.join(__dirname, '..', 'config') 
    : (process.env.CONFIG_PATH || '/config');

// 确保配置文件路径正确
const AUTH_CONFIG_PATH = path.join(CONFIG_PATH, 'auth.yaml');
const CONTAINER_LINKS_PATH = path.join(CONFIG_PATH, 'container_links.yaml');
const WEBSITE_LINKS_PATH = path.join(CONFIG_PATH, 'website_links.yaml');
const JWT_CONFIG_PATH = path.join(CONFIG_PATH, 'jwt.yaml');

// 创建默认配置
const defaultAuthConfig = {
    users: {
        admin: {
            password: 'navpanel123'
        }
    }
};

// 确保配置文件存在
const configs = [
    { path: AUTH_CONFIG_PATH, defaultContent: defaultAuthConfig },
    { path: CONTAINER_LINKS_PATH, defaultContent: {} },
    { path: WEBSITE_LINKS_PATH, defaultContent: {} },
    { path: JWT_CONFIG_PATH, defaultContent: { secret: crypto.randomBytes(64).toString('hex') } }
];

configs.forEach(({ path, defaultContent }) => {
    if (!fs.existsSync(path)) {
        fs.writeFileSync(path, yaml.dump(defaultContent));
        console.log('已创建默认配置文件:', path);
    }
});

// 加载认证配置
const authConfig = yaml.load(fs.readFileSync(AUTH_CONFIG_PATH, 'utf8'));

// 创建认证中间件
const users = Object.fromEntries(
    Object.entries(authConfig.users).map(([username, user]) => [
        username,
        user.password
    ])
);

const authMiddleware = basicAuth({
    users,
    challenge: false,
    realm: 'Docker Management',
    authorizeAsync: false,
    authorizer: (username, password) => {
        const user = authConfig.users[username];
        return user && user.password === password;
    }
});

// 加载 JWT 配置
const jwtConfig = yaml.load(fs.readFileSync(JWT_CONFIG_PATH, 'utf8'));
const JWT_SECRET = jwtConfig.secret;
const JWT_EXPIRES_IN = '1d';

// 创建 JWT 认证中间件
const jwtAuthMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: '无效的认证令牌' });
    }
};

// 创建登录请求限制器
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 5, // 限制每个IP 15分钟内最多5次请求
    message: { error: '请求过于频繁，请稍后再试' }
});

// 错误处理函数
const handleError = (res, err, message) => {
    console.error(message, err);
    res.status(500).json({ 
        error: err.message || message,
        details: err.stack
    });
};

// 登录路由
app.post('/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    const user = authConfig.users[username];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    // 生成 JWT token
    const token = jwt.sign(
        { username },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({ 
        message: '登录成功',
        token,
        user: { username }
    });
});

// 添加一个测试接口来验证 JWT 是否正常工作
app.get('/test-auth', jwtAuthMiddleware, (req, res) => {
    res.json({ 
        message: '认证成功',
        user: req.user
    });
});

// 根路由重定向到 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 添加登录页面路由
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 获取容器列表 - 需要认证
app.get('/containers', jwtAuthMiddleware, async (req, res) => {
    try {
        const containers = await docker.listContainers({ all: true });
        if (!Array.isArray(containers)) {
            throw new Error('获取容器列表失败：返回数据格式不正确');
        }
        res.json(containers.map(c => ({
            id: c.Id,
            name: c.Names[0],
            status: c.State
        })));
    } catch (err) {
        handleError(res, err, '获取容器列表失败');
    }
});

// 控制容器状态 - 需要认证
app.post('/containers/:id/:action', jwtAuthMiddleware, async (req, res) => {
    const container = docker.getContainer(req.params.id);
    try {
        if (req.params.action === 'start') await container.start();
        else if (req.params.action === 'stop') await container.stop();
        res.sendStatus(200);
    } catch (err) {
        handleError(res, err, '操作容器失败');
    }
});

// 更新容器启动连接配置
app.post('/container-links', jwtAuthMiddleware, async (req, res) => {
    try {
        const { containerId, link } = req.body;
        const links = yaml.load(fs.readFileSync(CONTAINER_LINKS_PATH, 'utf8')) || {};
        
        const container = docker.getContainer(containerId);
        const containerInfo = await container.inspect();
        const containerName = containerInfo.Name.replace(/^\//, '');
        const shortId = containerId.substring(0, 12);
        
        if (link) {
            links[containerName] = { shortId, link };
        } else {
            delete links[containerName];
        }
        
        fs.writeFileSync(CONTAINER_LINKS_PATH, yaml.dump(links));
        res.sendStatus(200);
    } catch (err) {
        handleError(res, err, '更新容器链接配置失败');
    }
});

// 获取容器启动连接配置
app.get('/container-links', jwtAuthMiddleware, async (req, res) => {
    try {
        const links = yaml.load(fs.readFileSync(CONTAINER_LINKS_PATH, 'utf8')) || {};
        const validLinks = {};
        
        for (const [containerName, linkInfo] of Object.entries(links)) {
            try {
                const containers = await docker.listContainers({ all: true });
                const containerExists = containers.some(c => c.Names.some(n => n.replace(/^\//, '') === containerName));
                
                if (containerExists) {
                    validLinks[containerName] = linkInfo;
                }
            } catch (err) {
                // 容器不存在，跳过
            }
        }
        
        if (Object.keys(validLinks).length !== Object.keys(links).length) {
            fs.writeFileSync(CONTAINER_LINKS_PATH, yaml.dump(validLinks));
        }
        
        res.json(validLinks);
    } catch (err) {
        handleError(res, err, '读取容器链接配置失败');
    }
});

// 获取网站信息
app.get('/api/website-info', jwtAuthMiddleware, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: '缺少URL参数' });
        }

        const response = await fetch(url);
        const html = await response.text();
        const dom = new jsdom.JSDOM(html);
        const document = dom.window.document;

        // 获取网站标题
        const title = document.querySelector('title')?.textContent || '未知网站';

        // 获取网站图标
        let icon = null;
        const iconElement = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
        if (iconElement) {
            const iconUrl = new URL(iconElement.href, url).toString();
            icon = iconUrl;
        }

        res.json({ title, icon });
    } catch (error) {
        console.error('获取网站信息失败:', error);
        res.status(500).json({ error: '获取网站信息失败' });
    }
});

// 获取网站列表
app.get('/website-links', jwtAuthMiddleware, async (req, res) => {
    try {
        const links = yaml.load(fs.readFileSync(WEBSITE_LINKS_PATH, 'utf8')) || {};
        res.json(links);
    } catch (error) {
        console.error('读取网站链接配置失败:', error);
        res.status(500).json({ error: '读取网站链接配置失败' });
    }
});

// 保存网站链接
app.post('/website-links', jwtAuthMiddleware, async (req, res) => {
    try {
        const { url, title, icon } = req.body;
        const links = yaml.load(fs.readFileSync(WEBSITE_LINKS_PATH, 'utf8')) || {};
        
        links[url] = { title, icon };
        
        fs.writeFileSync(WEBSITE_LINKS_PATH, yaml.dump(links));
        res.sendStatus(200);
    } catch (error) {
        console.error('保存网站链接配置失败:', error);
        res.status(500).json({ error: '保存网站链接配置失败' });
    }
});

// 删除网站链接
app.delete('/website-links', jwtAuthMiddleware, async (req, res) => {
    try {
        const { url } = req.body;
        const links = yaml.load(fs.readFileSync(WEBSITE_LINKS_PATH, 'utf8')) || {};
        
        if (links[url]) {
            delete links[url];
            fs.writeFileSync(WEBSITE_LINKS_PATH, yaml.dump(links));
            res.sendStatus(200);
        } else {
            res.status(404).json({ error: '网站不存在' });
        }
    } catch (error) {
        console.error('删除网站链接配置失败:', error);
        res.status(500).json({ error: '删除网站链接配置失败' });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT); 