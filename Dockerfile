# 使用Node.js官方镜像作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --production --registry=https://registry.npmmirror.com

# 复制源代码
COPY src/ ./src/
COPY config/ ./config/
COPY build.js ./
RUN node build.js

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=4000

# 暴露端口（如果需要）
EXPOSE 4000

# 启动命令
CMD ["node", "./dist/server.js"] 