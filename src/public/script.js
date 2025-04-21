// 检查认证状态
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login.html';
}

// 添加认证头到所有请求
const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
};

// 防止通过浏览器返回按钮重新进入
window.onpopstate = function(event) {
    if (!localStorage.getItem('token')) {
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
    localStorage.removeItem('token');
    window.location.href = '/login.html';
}

// 页面加载时获取容器列表
document.addEventListener('DOMContentLoaded', fetchContainers);

// 搜索功能
function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    
    if (query) {
        // 使用Google搜索
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        window.open(searchUrl, '_blank');
    }
}

// 添加回车键搜索功能
document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        performSearch();
    }
});

// 网站收藏相关功能
let websites = {};

// 获取网站列表
async function fetchWebsites() {
    try {
        const response = await fetch('/website-links', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        if (!response.ok) {
            throw new Error('获取网站列表失败');
        }
        websites = await response.json();
        renderWebsites();
    } catch (error) {
        console.error('获取网站列表失败:', error);
        showError('获取网站列表失败');
    }
}

// 网站右键菜单相关
let currentWebsiteUrl = null;

// 渲染网站列表
function renderWebsites() {
    const websiteList = document.getElementById('website-list');
    websiteList.innerHTML = '';
    
    Object.entries(websites).forEach(([url, info]) => {
        const div = document.createElement('div');
        div.className = 'website-item';
        div.onclick = () => window.open(url, '_blank');
        div.oncontextmenu = (e) => {
            e.preventDefault();
            currentWebsiteUrl = url;
            const menu = document.getElementById('websiteContextMenu');
            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
        };
        
        const icon = document.createElement('img');
        icon.className = 'website-icon';
        icon.src = info.icon || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI0I4QjhEMSIgZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgMThjLTQuNDEgMC04LTMuNTktOC04czMuNTktOCA4LTggOCAzLjU5IDggOC0zLjU5IDgtOCA4eiIvPjwvc3ZnPg==';
        icon.alt = info.title;
        
        const title = document.createElement('p');
        title.className = 'website-title';
        title.textContent = info.title;
        
        div.appendChild(icon);
        div.appendChild(title);
        websiteList.appendChild(div);
    });
}

// 点击页面其他地方时隐藏所有右键菜单
document.addEventListener('click', (e) => {
    const websiteContextMenu = document.getElementById('websiteContextMenu');
    if (!e.target.closest('.context-menu')) {
        websiteContextMenu.style.display = 'none';
    }
});

// 删除网站
async function deleteWebsite() {
    if (!currentWebsiteUrl) return;

    try {
        const response = await fetch('/website-links', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: currentWebsiteUrl })
        });

        if (!response.ok) {
            throw new Error('删除网站失败');
        }

        document.getElementById('websiteContextMenu').style.display = 'none';
        fetchWebsites();
    } catch (error) {
        console.error('删除网站失败:', error);
        showError('删除网站失败');
    }
}

// 添加网站模态框相关
function openAddWebsiteModal() {
    document.getElementById('addWebsiteModal').style.display = 'block';
}

function closeAddWebsiteModal() {
    document.getElementById('addWebsiteModal').style.display = 'none';
}

async function saveWebsite() {
    const url = document.getElementById('websiteUrl').value.trim();
    if (!url) {
        showError('请输入网站链接');
        return;
    }

    try {
        // 获取网站标题和图标
        const response = await fetch(`/api/website-info?url=${encodeURIComponent(url)}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error('获取网站信息失败');
        }
        
        const websiteInfo = await response.json();
        
        // 保存网站信息
        const saveResponse = await fetch('/website-links', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url,
                title: websiteInfo.title,
                icon: websiteInfo.icon
            })
        });
        
        if (!saveResponse.ok) {
            throw new Error('保存网站失败');
        }
        
        closeAddWebsiteModal();
        fetchWebsites();
    } catch (error) {
        console.error('保存网站失败:', error);
        showError('保存网站失败');
    }
}

// 页面加载时获取网站列表
document.addEventListener('DOMContentLoaded', () => {
    fetchContainers();
    fetchWebsites();
}); 