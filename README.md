# 百万拳时间

一个本地优先的学习与专注计时器。数据默认保存在本机 SQLite 文件中；无需账号、无需联网，也不把学习记录上传到第三方服务。

## 当前架构

- Vite 前端：主页、专注态、悬浮态、项目目录、时间段与统计界面。
- Node.js 本地服务：同源 REST API、静态文件托管、请求体限制与统一错误响应。
- SQLite：WAL 模式、外键、事务迁移、软删除和审计日志。
- 数据规则：项目最多五层；归档与删除分离；时间段允许独立存在，之后再分配项目。

## 运行

需要 Node.js 22.5 或更高版本（使用内置 `node:sqlite`）和 pnpm 9+。建议先执行 `corepack enable`，再使用项目锁文件安装依赖。

```bash
corepack enable
pnpm install
pnpm run build
pnpm start
```

打开 `http://127.0.0.1:3001`。第一次启动会创建 `data/baiwanquan.sqlite`；该目录已被 Git 忽略。

开发时分别启动两个终端：

```bash
pnpm run api
pnpm run dev
```

Vite 会把 `/api` 请求代理到本地 API 服务。

## 桌面开发模式

开发桌面版时使用：

```bash
pnpm run desktop:dev
```

该命令会启动隔离的本地 API（端口 3101）、Vite 热更新服务和 Electron 窗口。代码保存后页面会自动刷新；关闭开发窗口会停止相关进程。开发记录保存到 `data-dev/`，不会影响安装版或普通开发模式的 `data/`。

确认改动后，构建安装包：

```bash
pnpm run build:desktop
```

## 验证

```bash
pnpm test
pnpm run build
```

测试使用系统临时目录中的数据库，不会读取或修改 `data/` 中的用户数据。

## 数据与备份

- 查看服务健康状态：`GET /api/v1/health`
- 导出完整可移植 JSON：`GET /api/v1/export`
- 导入 JSON 备份：`POST /api/v1/import`，请求体必须显式包含 `{ "replace": true, "data": ... }`；会替换当前本地数据。
- 默认数据库位置：`data/baiwanquan.sqlite`

关闭应用后复制该 SQLite 文件即可完成离线备份。生产环境不要将数据库文件放在云盘的实时同步目录，以避免多个进程同时写入。

## API 概览

| 资源 | 支持操作 |
| --- | --- |
| 项目 | 查询、创建、改名/改说明、归档、恢复 |
| 时间段 | 按时间/项目查询、创建、编辑、软删除 |
| 统计 | 基于真实时间段按日期聚合 |
| 计时器 | 查询、保存秒表或倒计时状态 |
| 设置 | 查询、保存本地偏好 |
| 导出 | 读取完整 JSON 备份 |

详细的数据规则与端点契约见 [docs/architecture.md](docs/architecture.md)。

## 发布到 GitHub

提交前，先确认数据库、构建产物和本地缓存没有被加入版本控制：本项目的 `.gitignore` 已排除这些内容。然后在项目根目录执行：

```bash
git init
git add .
git commit -m "feat: initial public release"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

先在 GitHub 创建一个**空仓库**（不要勾选 README、`.gitignore` 或 License），再把上述地址替换到 `git remote add origin`。首次推送时 GitHub 会要求在浏览器登录或使用 Personal Access Token；不再使用账户密码。

面试展示建议在仓库首页放三张界面截图、写清本地优先架构和关键数据规则，并通过 GitHub Releases 上传 `release/` 中的安装包；安装包不要直接提交进 Git 仓库。
