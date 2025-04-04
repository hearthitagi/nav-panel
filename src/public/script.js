// 检查认证状态
const auth = localStorage.getItem('auth');
if (!auth) {
    window.location.href = '/login.html';
}

// 添加认证头到所有请求
const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
};

// 防止通过浏览器返回按钮重新进入
window.onpopstate = function(event) {
    if (!localStorage.getItem('auth')) {
        window.location.href = '/login.html';
    }
};

// 显示错误信息
function showError(message) {
    const errorElement = document.getElementById('error');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 3000);
    }
}

// 创建容器卡片
function createContainerCard(container, linkInfo) {
    const template = document.getElementById('container-template');
    const card = template.content.cloneNode(true).querySelector('.container');
    const isRunning = container.status === 'running';
    const containerName = container.name.replace(/^\//, '');
    
    // 设置基本信息
    card.classList.add(isRunning ? 'running' : 'exited');
    card.querySelector('h3').textContent = containerName;
    
    // 设置状态标签
    const statusBadge = card.querySelector('.status-badge');
    statusBadge.classList.add(`status-${container.status}`);
    statusBadge.textContent = isRunning ? '运行中' : '已停止';
    
    // 设置按钮
    const openBtn = card.querySelector('.open-btn');
    if (linkInfo?.link) {
        openBtn.style.display = '';
        openBtn.onclick = () => window.open(linkInfo.link, '_blank');
    }
    
    const controlBtn = card.querySelector('.control-btn');
    controlBtn.querySelector('span').textContent = isRunning ? '停止' : '启动';
    if (isRunning) {
        controlBtn.classList.add('stop-btn');
    }
    controlBtn.onclick = () => controlContainer(container.id, isRunning ? 'stop' : 'start');
    
    card.querySelector('.config-btn').onclick = () => 
        openConfigModal(container.id, containerName, linkInfo?.link || '');
    
    return card;
}

// 获取容器列表
async function fetchContainers() {
    try {
        const [containers, links] = await Promise.all([
            fetch('/containers', { headers }).then(r => r.json()),
            fetch('/container-links', { headers }).then(r => r.json())
        ]);
        
        const containerList = document.getElementById('container-list');
        containerList.innerHTML = '';
        
        if (Array.isArray(containers)) {
            containers.forEach(container => {
                const containerName = container.name.replace(/^\//, '');
                containerList.appendChild(createContainerCard(container, links[containerName]));
            });
        } else {
            throw new Error('返回的数据不是数组');
        }
    } catch (error) {
        console.error('获取容器列表失败:', error);
        showError('获取容器列表失败，请检查网络连接');
    }
}

// 控制容器
async function controlContainer(id, action) {
    const button = event.target.closest('.control-btn');
    if (!button) return;
    
    button.disabled = true;
    try {
        const response = await fetch(`/containers/${id}/${action}`, {
            method: 'POST',
            headers
        });
        if (response.ok) {
            fetchContainers();
        } else {
            throw new Error('操作失败');
        }
    } catch (error) {
        console.error('操作容器失败:', error);
        showError('操作容器失败，请重试');
    } finally {
        button.disabled = false;
    }
}

// 配置相关变量和函数
let currentContainerId = null;
let currentContainerName = null;

function openConfigModal(containerId, containerName, currentLink) {
    currentContainerId = containerId;
    currentContainerName = containerName;
    document.getElementById('containerLink').value = currentLink;
    document.getElementById('configModal').style.display = 'block';
}

function closeConfigModal() {
    document.getElementById('configModal').style.display = 'none';
    currentContainerId = null;
    currentContainerName = null;
}

async function saveContainerLink() {
    const link = document.getElementById('containerLink').value.trim();
    try {
        const response = await fetch('/container-links', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                containerId: currentContainerId,
                link: link || null
            })
        });
        
        if (response.ok) {
            closeConfigModal();
            fetchContainers();
        } else {
            throw new Error('保存配置失败');
        }
    } catch (error) {
        console.error('保存配置失败:', error);
        showError('保存配置失败，请重试');
    }
}

// 点击模态框外部关闭
window.onclick = event => {
    const modal = document.getElementById('configModal');
    if (event.target === modal) {
        closeConfigModal();
    }
};

// 退出登录
function logout() {
    localStorage.removeItem('auth');
    window.location.href = '/login.html';
}

// 页面加载时获取容器列表
document.addEventListener('DOMContentLoaded', fetchContainers); 