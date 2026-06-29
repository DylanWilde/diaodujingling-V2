# 调度精灵 V8 后端

FastAPI + SQLite + JWT — 上海港船舶调度协作 API

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 配置 JWT 密钥
cp .env.example .env
# 编辑 .env 中的 JWT_SECRET

# 启动开发服务器
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 打开 API 文档
# http://localhost:8000/docs
```

## 运行测试

```bash
pytest tests/test_api.py -v
```

## 预置账号

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin888 | 管理员 |
| 姜磊 | 姜磊888 | 管理员 |
| 韩韦 | hanwei888 | 领导 |
| 冯磊 | 冯磊888 | 调度员 |
| 索翼 | suoyi888 | 调度员 |
| 李诗年 | lishinian888 | 调度员 |

> 其他调度员/领导初始密码为 用户名+888，首次登录后应修改

## 生产部署

```bash
# 一键部署到 Ubuntu 服务器
bash deploy.sh
```

部署后访问 `http://服务器IP/api/health` 验证。

## API 概览

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 登录获取 JWT |
| `/api/auth/me` | GET | 当前用户信息 |
| `/api/ships?date=YYYY-MM-DD` | GET | 按日期查询船舶（分页） |
| `/api/ships` | POST | 新增船舶 |
| `/api/ships/{id}` | PUT | 更新船舶 |
| `/api/ships/{id}` | DELETE | 删除船舶 |
| `/api/ships/batch/{date}` | POST | 批量替换某日期船舶 |
| `/api/ships/dates` | GET | 列出所有日期 |
| `/api/ships/maritime/{id}` | PUT | 更新海事申报 |
| `/api/blackboard?date=YYYY-MM-DD` | GET | 黑板消息 |
| `/api/blackboard` | POST | 发消息 |
| `/api/blackboard/{id}` | DELETE | 删消息 |
| `/api/workflow?date=YYYY-MM-DD` | GET | 流程记录 |
| `/api/workflow/sync/{date}` | POST | 从船期同步 |
| `/api/workflow/{id}/advance/{stage}` | PUT | 推进阶段 |
| `/api/workflow/{id}/channel-pass` | PUT | 走槽确认 |
| `/api/users` | GET | 用户列表（admin） |
| `/api/users` | POST | 创建用户（admin） |
| `/api/users/{username}/role` | PUT | 修改角色（admin） |
| `/api/users/{username}/password` | PUT | 重置密码（admin） |
| `/api/users/{username}` | DELETE | 删除用户（admin） |

## 前端配置

在 `index.html` 同一目录的 `js/app.js` 中修改 `APP_CONFIG`：

```javascript
var APP_CONFIG = {
  // ... 其他配置
  apiBase: 'http://你的服务器IP'  // 或域名
};
```
