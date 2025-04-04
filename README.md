## 使用 Docker Compose（推荐）

```yaml
services:
  nav-panel:
    image: nav-panel:latest
    container_name: nav-panel
    ports:
      - "4000:4000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /path/to/config:/config
    restart: unless-stopped
```

## 使用 Docker Run

运行容器：
```bash
docker run -d \
  --name nav-panel \
  -p 4000:4000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /path/to/config:/config \
  nav-panel:latest
```
## 配置文件说明

用户配置位于挂载的 `/config` 目录下的 `auth.yaml` 文件。默认配置如下：

```yaml
# Docker 管理平台用户配置
# 默认用户名: admin
# 默认密码: navpanel123

users:
  admin:
    password: navpanel123  # 建议修改默认密码
    role: admin      # 用户角色：admin 或 user 
```

## 开发环境运行

1. 安装依赖：
```bash
npm install
```

2. 创建配置文件：
```bash
mkdir -p config
```

3. 启动服务器：
```bash
npm run dev
```