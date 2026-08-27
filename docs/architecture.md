# 架构与数据契约

## 设计原则

1. 本地优先：应用的核心能力不依赖网络、账号或第三方服务。
2. 明确归属：项目是树；时间段是独立记录，`projectId` 可以为空。
3. 不丢历史：项目使用归档状态，时间段使用软删除，关键变更写入审计日志。
4. 可迁移：数据库迁移具有顺序版本；导出 JSON 带格式版本。
5. 可演进：HTTP API 与界面分层；未来同步服务可在不改变领域模型的情况下增加。

## 领域模型

```text
Project 1 ──── * Project       (parentId，最多五层)
Project 0..1 ─ * TimeEntry    (未分配时间段的 projectId 为 null)
TimerState 1                   (单用户当前计时器)
Setting *                      (界面与行为偏好)
AuditLog *                     (本地变更追踪)
```

### 项目

- `id`：UUID。
- `parentId`：可空；创建时验证父项目存在，且最大深度不超过五层。
- `status`：`active` 或 `archived`。归档一个项目会在同一事务中归档全部子项目；恢复同理。
- 项目名称和说明均受长度约束。

### 时间段

- `startedAt` / `endedAt`：ISO 8601 UTC 时间，结束不得早于开始。
- `mode`：`stopwatch` 或 `countdown`。
- `plannedSeconds`：仅倒计时可选，范围 1 秒至 24 小时。
- 删除采用 `deletedAt` 软删除，统计与默认查询不包含已删除数据。

### 计时器

- 模式：`stopwatch` / `countdown`。
- 状态：`idle` / `running` / `paused`。
- 倒计时运行时必须包含计划时长；运行状态必须具有开始时间。
- 前端显示应根据保存的基准时间与当前系统时钟推导，不以每秒写库作为同步方案。

## HTTP API

所有 API 位于 `/api/v1`，成功响应为 JSON；校验失败返回 `400` 与 `{ error: { code, message } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务探针 |
| GET | `/bootstrap` | 项目、时间段、计时器、设置的初始化快照 |
| GET/POST | `/projects` | 查询/创建项目 |
| PATCH | `/projects/:id` | 修改名称或说明 |
| POST | `/projects/:id/archive` | 归档整个项目子树 |
| POST | `/projects/:id/restore` | 恢复整个项目子树 |
| GET/POST | `/time-entries` | 查询/创建时间段 |
| PATCH/DELETE | `/time-entries/:id` | 编辑/软删除时间段 |
| GET | `/statistics` | 按 `from`、`to`、`projectId` 筛选并返回记录、每日汇总与总时长 |
| GET/PUT | `/timer` | 读取/保存计时器检查点 |
| GET | `/settings` | 读取设置 |
| PUT | `/settings/:key` | 写入设置值 `{ "value": ... }` |
| GET | `/export` | 导出完整 JSON 备份 |
| POST | `/import` | 显式确认后以 JSON 备份替换本地数据 |

## 安全边界

本版本绑定 `127.0.0.1`，只服务本机单用户；不会开放局域网访问、登录或跨域写入。若未来支持远程或多用户部署，需要另行引入 HTTPS、账户、会话、授权、速率限制、备份策略和 PostgreSQL，不能把本地服务直接暴露到公网。
