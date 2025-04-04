import express from 'express';
import Docker from 'dockerode';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import fs from 'fs';
import cors from 'cors';
import basicAuth from 'express-basic-auth';

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
    { path: CONTAINER_LINKS_PATH, defaultContent: {} }
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

// 错误处理函数
const handleError = (res, err, message) => {
    console.error(message, err);
    res.status(500).json({ 
        error: err.message || message,
        details: err.stack
    });
};

// 登录路由
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = authConfig.users[username];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    res.json({ 
        message: '登录成功',
        user: { username }
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
app.get('/containers', authMiddleware, async (req, res) => {
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
app.post('/containers/:id/:action', authMiddleware, async (req, res) => {
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
app.post('/container-links', authMiddleware, async (req, res) => {
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
app.get('/container-links', authMiddleware, async (req, res) => {
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

const PORT = process.env.PORT || 4000;
app.listen(PORT); 