import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ValidationError } from './validation.js';

const now = () => new Date().toISOString();

const migrations = [
  `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
      name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      archived_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_parent_order ON projects(parent_id, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('stopwatch', 'countdown')),
      planned_seconds INTEGER CHECK(planned_seconds IS NULL OR planned_seconds BETWEEN 1 AND 86400),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      CHECK(ended_at >= started_at)
    );
    CREATE INDEX IF NOT EXISTS idx_entries_time ON time_entries(started_at, ended_at);
    CREATE INDEX IF NOT EXISTS idx_entries_project_time ON time_entries(project_id, started_at);

    CREATE TABLE IF NOT EXISTS timer_state (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      mode TEXT NOT NULL CHECK(mode IN ('stopwatch', 'countdown')),
      state TEXT NOT NULL CHECK(state IN ('idle', 'running', 'paused')),
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      started_at TEXT,
      elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_seconds >= 0),
      planned_seconds INTEGER CHECK(planned_seconds IS NULL OR planned_seconds BETWEEN 1 AND 86400),
      note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at);
  `,
];

const mapProject = (row) => row && ({
  id: row.id, parentId: row.parent_id, name: row.name, description: row.description,
  status: row.status, archivedAt: row.archived_at, sortOrder: row.sort_order,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapEntry = (row) => row && ({
  id: row.id, projectId: row.project_id, startedAt: row.started_at, endedAt: row.ended_at,
  mode: row.mode, plannedSeconds: row.planned_seconds, note: row.note,
  durationSeconds: Math.max(0, Math.floor((Date.parse(row.ended_at) - Date.parse(row.started_at)) / 1000)),
  createdAt: row.created_at, updatedAt: row.updated_at,
});

export class Database {
  constructor(filename) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  migrate() {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    for (const [index, sql] of migrations.entries()) {
      const version = index + 1;
      if (this.db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)) continue;
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(sql);
        this.db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, now());
        this.db.exec('COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    const timer = this.db.prepare('SELECT singleton FROM timer_state WHERE singleton = 1').get();
    if (!timer) this.db.prepare(`INSERT INTO timer_state(singleton, mode, state, elapsed_seconds, note, updated_at) VALUES (1, 'stopwatch', 'idle', 0, '', ?)`).run(now());
    // 新安装版只提供一个空的一级项目；示例项目不会写入任何用户数据库。
    const hasProject = this.db.prepare('SELECT 1 FROM projects LIMIT 1').get();
    if (!hasProject && process.env.BAIWANQUAN_SEED_DEFAULT_PROJECT === '1') {
      const timestamp = now();
      this.db.prepare('INSERT INTO projects(id, parent_id, name, description, status, sort_order, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, 0, ?, ?)')
        .run(randomUUID(), '百万拳', '', 'active', timestamp, timestamp);
    }
  }

  audit(entityType, entityId, action, payload) {
    this.db.prepare('INSERT INTO audit_log(id, entity_type, entity_id, action, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), entityType, entityId, action, JSON.stringify(payload), now());
  }

  projectDepth(parentId) {
    let depth = 0;
    let cursor = parentId;
    while (cursor) {
      const row = this.db.prepare('SELECT parent_id FROM projects WHERE id = ?').get(cursor);
      if (!row) throw new ValidationError('父项目不存在');
      depth += 1;
      cursor = row.parent_id;
      if (depth > 5) throw new ValidationError('项目层级无效');
    }
    return depth;
  }

  listProjects({ includeArchived = false } = {}) {
    const rows = this.db.prepare(`SELECT * FROM projects ${includeArchived ? '' : "WHERE status = 'active'"} ORDER BY parent_id IS NOT NULL, parent_id, sort_order, created_at`).all();
    return rows.map(mapProject);
  }

  getProject(projectId) { return mapProject(this.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId)); }

  assertAssignableProject(projectId) {
    if (!projectId) return;
    const project = this.getProject(projectId);
    if (!project) throw new ValidationError('所属项目不存在');
    if (project.status !== 'active') throw new ValidationError('归档项目不能接收新的时间段');
  }

  createProject({ name, parentId = null, description = '' }) {
    if (parentId && this.projectDepth(parentId) >= 5) throw new ValidationError('项目最多 5 层');
    if (parentId && this.getProject(parentId)?.status !== 'active') throw new ValidationError('不能在归档项目下创建子项目');
    const id = randomUUID();
    const timestamp = now();
    const sortOrder = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM projects WHERE parent_id IS ?').get(parentId).next;
    this.db.prepare('INSERT INTO projects(id, parent_id, name, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, parentId, name, description, sortOrder, timestamp, timestamp);
    const project = this.getProject(id);
    this.audit('project', id, 'created', project);
    return project;
  }

  updateProject(projectId, changes) {
    const current = this.getProject(projectId);
    if (!current) return null;
    const next = { ...current, ...changes };
    const timestamp = now();
    this.db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(next.name, next.description, timestamp, projectId);
    const project = this.getProject(projectId);
    this.audit('project', projectId, 'updated', changes);
    return project;
  }

  archiveProject(projectId, archive) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const timestamp = now();
    const descendants = [projectId];
    for (let index = 0; index < descendants.length; index += 1) {
      const children = this.db.prepare('SELECT id FROM projects WHERE parent_id = ?').all(descendants[index]);
      descendants.push(...children.map((child) => child.id));
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const update = this.db.prepare('UPDATE projects SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?');
      descendants.forEach((projectIdToUpdate) => update.run(archive ? 'archived' : 'active', archive ? timestamp : null, timestamp, projectIdToUpdate));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    const result = this.getProject(projectId);
    this.audit('project', projectId, archive ? 'archived' : 'restored', { project: result, affectedProjectIds: descendants });
    return result;
  }

  listEntries({ from, to, projectId, projectIds } = {}) {
    const where = ['deleted_at IS NULL']; const values = [];
    if (from) { where.push('ended_at >= ?'); values.push(from); }
    if (to) { where.push('started_at <= ?'); values.push(to); }
    if (projectId !== undefined) { where.push('project_id IS ?'); values.push(projectId); }
    if (projectIds?.length) { where.push(`project_id IN (${projectIds.map(() => '?').join(', ')})`); values.push(...projectIds); }
    return this.db.prepare(`SELECT * FROM time_entries WHERE ${where.join(' AND ')} ORDER BY started_at DESC`).all(...values).map(mapEntry);
  }

  createEntry(entry) {
    this.assertAssignableProject(entry.projectId);
    const id = randomUUID(); const timestamp = now();
    this.db.prepare(`INSERT INTO time_entries(id, project_id, started_at, ended_at, mode, planned_seconds, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, entry.projectId, entry.startedAt, entry.endedAt, entry.mode, entry.plannedSeconds, entry.note, timestamp, timestamp);
    const result = mapEntry(this.db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id));
    this.audit('time_entry', id, 'created', result);
    return result;
  }

  updateEntry(entryId, changes) {
    const current = mapEntry(this.db.prepare('SELECT * FROM time_entries WHERE id = ? AND deleted_at IS NULL').get(entryId));
    if (!current) return null;
    const next = { ...current, ...changes }; const timestamp = now();
    this.assertAssignableProject(next.projectId);
    this.db.prepare(`UPDATE time_entries SET project_id = ?, started_at = ?, ended_at = ?, mode = ?, planned_seconds = ?, note = ?, updated_at = ? WHERE id = ?`)
      .run(next.projectId, next.startedAt, next.endedAt, next.mode, next.plannedSeconds, next.note, timestamp, entryId);
    const result = mapEntry(this.db.prepare('SELECT * FROM time_entries WHERE id = ?').get(entryId));
    this.audit('time_entry', entryId, 'updated', changes);
    return result;
  }

  deleteEntry(entryId) {
    const timestamp = now();
    const result = this.db.prepare('UPDATE time_entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(timestamp, timestamp, entryId);
    if (!result.changes) return false;
    this.audit('time_entry', entryId, 'deleted', {});
    return true;
  }

  statistics({ from, to, projectId, includeDescendants = false, timeZone = 'UTC' } = {}) {
    let projectIds;
    if (projectId && includeDescendants) {
      const children = new Map();
      this.listProjects({ includeArchived: true }).forEach((project) => {
        const key = project.parentId ?? '';
        if (!children.has(key)) children.set(key, []);
        children.get(key).push(project.id);
      });
      projectIds = [projectId];
      for (let index = 0; index < projectIds.length; index += 1) projectIds.push(...(children.get(projectIds[index]) ?? []));
    }
    const entries = this.listEntries({ from, to, projectId: projectIds ? undefined : projectId, projectIds });
    const daily = new Map();
    const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const localDate = (iso) => {
      const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    };
    for (const entry of entries) {
      const key = localDate(entry.startedAt);
      const current = daily.get(key) ?? { date: key, seconds: 0, entries: 0 };
      current.seconds += entry.durationSeconds;
      current.entries += 1;
      daily.set(key, current);
    }
    return { entries, daily: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)), totalSeconds: entries.reduce((total, entry) => total + entry.durationSeconds, 0) };
  }

  getTimer() {
    const row = this.db.prepare('SELECT * FROM timer_state WHERE singleton = 1').get();
    return { mode: row.mode, state: row.state, projectId: row.project_id, startedAt: row.started_at, elapsedSeconds: row.elapsed_seconds, plannedSeconds: row.planned_seconds, note: row.note, updatedAt: row.updated_at };
  }

  saveTimer(timer) {
    this.assertAssignableProject(timer.projectId);
    const timestamp = now();
    this.db.prepare(`UPDATE timer_state SET mode = ?, state = ?, project_id = ?, started_at = ?, elapsed_seconds = ?, planned_seconds = ?, note = ?, updated_at = ? WHERE singleton = 1`)
      .run(timer.mode, timer.state, timer.projectId, timer.startedAt, timer.elapsedSeconds, timer.plannedSeconds, timer.note, timestamp);
    const result = this.getTimer();
    this.audit('timer', 'singleton', 'updated', result);
    return result;
  }

  getSettings() {
    return Object.fromEntries(this.db.prepare('SELECT key, value_json FROM settings').all().map((row) => [row.key, JSON.parse(row.value_json)]));
  }

  setSetting(key, value) {
    this.db.prepare(`INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(key, JSON.stringify(value), now());
    this.audit('setting', key, 'updated', value);
  }

  exportData() {
    return { version: 1, exportedAt: now(), projects: this.listProjects({ includeArchived: true }), entries: this.listEntries({}), settings: this.getSettings(), timer: this.getTimer() };
  }

  importData(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.entries) || !data.timer || typeof data.settings !== 'object') {
      throw new ValidationError('备份格式无效或版本不受支持');
    }
    const projectIds = new Set(data.projects.map((project) => project.id));
    for (const project of data.projects) {
      if (typeof project.id !== 'string' || typeof project.name !== 'string' || !['active', 'archived'].includes(project.status) || (project.parentId && !projectIds.has(project.parentId))) throw new ValidationError('备份中的项目数据无效');
    }
    for (const entry of data.entries) {
      if (typeof entry.id !== 'string' || (entry.projectId && !projectIds.has(entry.projectId)) || Number.isNaN(Date.parse(entry.startedAt)) || Number.isNaN(Date.parse(entry.endedAt)) || Date.parse(entry.endedAt) < Date.parse(entry.startedAt)) throw new ValidationError('备份中的时间段数据无效');
    }
    const timestamp = now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM audit_log; DELETE FROM time_entries; DELETE FROM projects; DELETE FROM settings;');
      const insertProject = this.db.prepare('INSERT INTO projects(id, parent_id, name, description, status, archived_at, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const pending = [...data.projects];
      while (pending.length) {
        const index = pending.findIndex((project) => !project.parentId || !pending.some((candidate) => candidate.id === project.parentId));
        if (index < 0) throw new ValidationError('备份中的项目树存在循环');
        const project = pending.splice(index, 1)[0];
        insertProject.run(project.id, project.parentId ?? null, project.name, project.description ?? '', project.status, project.archivedAt ?? null, project.sortOrder ?? 0, project.createdAt ?? timestamp, project.updatedAt ?? timestamp);
      }
      const insertEntry = this.db.prepare('INSERT INTO time_entries(id, project_id, started_at, ended_at, mode, planned_seconds, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      data.entries.forEach((entry) => insertEntry.run(entry.id, entry.projectId ?? null, entry.startedAt, entry.endedAt, entry.mode, entry.plannedSeconds ?? null, entry.note ?? '', entry.createdAt ?? timestamp, entry.updatedAt ?? timestamp));
      const insertSetting = this.db.prepare('INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)');
      Object.entries(data.settings).forEach(([key, value]) => insertSetting.run(key, JSON.stringify(value), timestamp));
      this.db.prepare('UPDATE timer_state SET mode = ?, state = ?, project_id = ?, started_at = ?, elapsed_seconds = ?, planned_seconds = ?, note = ?, updated_at = ? WHERE singleton = 1')
        .run(data.timer.mode, data.timer.state, data.timer.projectId ?? null, data.timer.startedAt ?? null, data.timer.elapsedSeconds ?? 0, data.timer.plannedSeconds ?? null, data.timer.note ?? '', timestamp);
      this.audit('backup', 'local', 'imported', { sourceExportedAt: data.exportedAt ?? null });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.exportData();
  }

  close() { this.db.close(); }
}
