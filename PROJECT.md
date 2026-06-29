# 调度精灵 / DispatchHub V7

上海港船舶调度 Web 应用 — 船期管理 · 海事申报 · 数据分析 · 离线AI助手

## 线上地址
https://dylanwilde.github.io/diaodujingling-V2/

## 仓库
https://github.com/DylanWilde/diaodujingling-V2

## 部署
- **平台**：GitHub Pages（`main` 分支为 Pages 源）
- **数据共享**：`data/ships.json` 通过 GitHub API 发布
- **推送方式**：GitHub REST API（git 直连被网络屏蔽，Token 存 IndexedDB AES-GCM 加密）
- **Token**：存入 `.env` 文件（已在 .gitignore），有效期至 2026-09-18，到期提醒已设 2026-09-11

## Tab 布局

| Tab | 名称 | 权限 | 说明 |
|-----|------|------|------|
| 0 | 🧠 调度精灵AI | 游客 | 纯本地数据库引擎，离线知识库，无API依赖 |
| 1 | 🚢 船舶动态 | 登录 | 按码头分组卡片 + ETA颜色预警(24h红/48h橙) + 船讯网AIS |
| 2 | 📋 海事申报 | 登录 | 7日海事完成确认 + ETA倒计时预警 |
| 3 | 📡 引航转换 | 登录 | 引航站原始格式 → 标准格式转换 |
| 4 | 📝 调度黑板 | 登录 | 按日期消息板 + IndexedDB存储 + 实时轮询 |
| 5 | ⚙️ 数据管理 | 管理员 | 上传Excel/手动录入/导出/备份恢复/月度归档 |
| 6 | 📊 数据分析 | 登录 | 周/月度(1-12月可选)/季度(Q1-Q4可选)/年度(2026-2028)/全部 + 5张图表 + 导出汇报 |

## 数据分析中心

**时间跨度**：周(近7天) / 月度(可选1-12月) / 季度(Q1-Q4) / 年度(2026-2028) / 全部历史

**去重逻辑**：`船名 + 进口航次 + 出口航次` 为唯一航次标识。同船同航次跨多天续报（报了未靠泊）算1个代理航次。

**KPI卡片（5项）**：代理航次、活跃天数、海事申报率、活跃码头、24h紧急预警

**5张图表**：
- 码头作业量排名（柱状图：航次数+海事完成）
- 时间趋势（折线图：航次数+申报率，周/月度按天，季度/年度按月）
- 航线流量 Top15（横向柱状图：上港→下港）
- 吃水分布（直方图：抵港蓝+离港红）
- ETA预警（环形图：24h/48h/正常/过期）

**2张明细表**：高频船舶 Top20 + 码头作业明细

**数据源**：合并 IndexedDB + GitHub Pages sharedShips，跨源按航次去重

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vanilla JS ES6 + HTML5 + CSS3，零框架 |
| 存储 | IndexedDB `DDB_v5` (ships/blackboard/accounts, v3) |
| 加密 | Web Crypto API AES-GCM + SHA-256 HMAC 密码哈希 |
| 图表 | Chart.js 4.4 CDN |
| Excel | SheetJS 0.20.3 CDN |
| 字体 | Noto Sans SC + DM Mono (Google Fonts) |
| AI | 纯本地意图检测 + 上海港知识库 + IndexedDB查询，零外部API |

## 数据模型 (ships store)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | auto | IndexedDB 主键 |
| date | string | 日期 YYYY-MM-DD |
| name | string | 中文船名 |
| en | string | 英文船名 |
| iv | string | 进口航次 |
| ev | string | 出口航次 |
| tm | string | 码头名称 |
| arRaw/arV | string/number | 抵港吃水 原始/数值(m) |
| drRaw/drV | string/number | 开航吃水 原始/数值(m) |
| pp | string | 上港 |
| np | string | 下港 |
| rm | string | 备注 |
| eta | string | ETA (M/DDHHMM格式) |
| _m | 0/1 | 手动录入标记 |
| maritime7 | 0/1 | 7日海事是否完成 |
| maritime7Note | string | 海事备注 |
| maritime7By | string | 确认人用户名 |

## 账号系统

- **管理员**：姜磊、王剑峰、杨华（可编辑所有日期、数据管理、发布）
- **调度员**：冯磊、赵逢时、丁思樑、肖明、沈正阳、聂铭辰（仅编辑当日）
- 首次运行自动生成随机密码，SHA-256+HMAC 哈希存储
- 管理员可通过「账号管理」创建/删除调度员

## 已知问题

- 数据分析Tab V7.3已完成：双数据源合并(IndexedDB+sharedShips)、航次去重(name+iv+ev)、可选周期(月度/季度/年度)
- 周度统计基于当前日期往前7天，如当前无数据则显示为空

## 发布流程

1. 管理员在 Tab5 上传 Excel 船期表 → SheetJS 解析 → IndexedDB
2. 自动 `publishDataSilent()` → GitHub API 合并远程数据 → PUT `data/ships.json`
3. 海事申报变更通过 `publishDeclChange()` 增量发布
4. 其他用户打开页面 → `tryLoadSharedData()` 拉取 `ships.json` → 合并到本地

## 文件结构

```
调度精灵/
├── index.html          # SPA 主页面 (487行)
├── css/
│   ├── style.css       # 布局 + 组件样式
│   └── effects.css     # 主题/粒子/动画/分析面板
├── js/
│   ├── app.js          # 主逻辑: 上传/解析/看板/发布/统计 (2200行)
│   ├── ai-assistant.js # AI本地引擎: 知识库/意图/查询
│   ├── analytics.js    # 数据分析引擎: 10组统计函数
│   ├── accounts.js     # 账号系统: 注册/登录/权限
│   ├── blackboard.js   # 调度黑板: IndexedDB消息存储
│   ├── crypto-utils.js # SHA-256 + AES-GCM 加密
│   ├── ships-map.js    # 船舶中英文名+IMO映射表
│   ├── effects.js      # 粒子海洋背景 + 数字动画
│   └── port-chart.js   # 海图扩展点(存根)
└── data/
    └── ships.json      # GitHub Pages 共享数据
```

## V8：后端化 + 多端同步（✅ 已完成 2026-06-29）

> FastAPI + SQLite + JWT，30测试通过，前端 API 适配层完成。

### 背景

当前调度精灵是纯前端 + IndexedDB + GitHub Pages 共享 JSON，存在数据孤岛（Excel散落各处）、多人协作冲突、跨表关联困难、无服务端鉴权等问题。且领导明确提出：调度大屏、业务板块拆分（集装箱/散杂货/进江）、三岗合一工作流（引航+单一窗口+总槽）、单一窗口自动化 等方向。

### 后端架构方向

- **FastAPI** (Python) + **SQLite** (起步) / PostgreSQL (扩展)
- REST API，JWT 鉴权
- 核心表：`ships`(主表) + `maritime_decl` + `pilotage` + `manifest` + `berths`
- 外键通过 `ship_id` 关联，一条船三个岗位各自更新状态
- 前端改造：优先读API，IndexedDB离线兜底

### 新增功能方向

1. **调度大屏 Tab** — 泊位分布 + 月度/年度累计 + 三板块进度 + 海事申报率
2. **业务板块字段** — `bizType`: container / bulk / river
3. **三岗工作流** — 引航/单一窗口/总槽 每条船进度条可视化
4. **单一窗口 Playwright 自动化** — 人机辅助模式，AI预填 + 人工确认
5. **外部数据源整合** — 一通、引航站数据接入

### 部署

- 腾讯云轻量服务器 ~60元/月
- Nginx + uvicorn + HTTPS
- 数据库 SQLite 文件起步，按需升 PostgreSQL

### 路线图

| Phase | 内容 | 优先级 |
|-------|------|--------|
| 1 | 数据模型加 bizType + 调度大屏 Tab | 🔴 最高 |
| 2 | 三岗工作流状态追踪 | 🟡 中 |
| 3 | FastAPI 后端骨架 + SQLite | 🟡 中 |
| 4 | Playwright 单一窗口验证 | 🟢 长期 |
| 5 | 外部数据源对接 | 🟢 长期 |

### 待讨论

- SQLite vs PostgreSQL 最终选型
- 部署环境确认（腾讯云 vs 内网服务器）
- 是否需要离线模式（IndexedDB 兜底）
- 单一窗口 API 申请可行性
