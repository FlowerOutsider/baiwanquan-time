import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Database } from '../server/database.js';

const withDatabase = async (callback) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baiwanquan-test-'));
  const database = new Database(path.join(directory, 'test.sqlite'));
  try { await callback(database); }
  finally { database.close(); fs.rmSync(directory, { recursive: true, force: true }); }
};

test('projects preserve hierarchy, max depth, and archive subtrees', async () => withDatabase((database) => {
  const root = database.createProject({ name: '根项目' });
  const child = database.createProject({ name: '子项目', parentId: root.id });
  const grandchild = database.createProject({ name: '孙项目', parentId: child.id });
  assert.equal(database.listProjects().length, 3);
  database.archiveProject(root.id, true);
  assert.equal(database.listProjects().length, 0);
  assert.equal(database.listProjects({ includeArchived: true }).every((project) => project.status === 'archived'), true);
  database.archiveProject(root.id, false);
  assert.equal(database.listProjects().length, 3);
  assert.equal(database.getProject(grandchild.id).status, 'active');

  let parent = grandchild;
  database.createProject({ name: '第四层', parentId: parent.id });
  parent = database.listProjects().find((project) => project.name === '第四层');
  database.createProject({ name: '第五层', parentId: parent.id });
  const fifth = database.listProjects().find((project) => project.name === '第五层');
  assert.throws(() => database.createProject({ name: '第六层', parentId: fifth.id }), /最多 5 层/);
}));

test('time entries are durable, independently assignable, and soft-deletable', async () => withDatabase((database) => {
  const entry = database.createEntry({ projectId: null, startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T10:00:00.000Z', mode: 'countdown', plannedSeconds: 3600, note: '独立时间段' });
  assert.equal(database.listEntries().length, 1);
  assert.equal(database.updateEntry(entry.id, { ...entry, note: '已编辑' }).note, '已编辑');
  assert.equal(database.deleteEntry(entry.id), true);
  assert.equal(database.listEntries().length, 0);
}));

test('archived projects reject new assignments while historical entries remain readable', async () => withDatabase((database) => {
  const project = database.createProject({ name: '待归档项目' });
  database.createEntry({ projectId: project.id, startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T10:00:00.000Z', mode: 'stopwatch', plannedSeconds: null, note: '' });
  database.archiveProject(project.id, true);
  assert.equal(database.listEntries().length, 1);
  assert.throws(() => database.createEntry({ projectId: project.id, startedAt: '2026-08-25T11:00:00.000Z', endedAt: '2026-08-25T12:00:00.000Z', mode: 'stopwatch', plannedSeconds: null, note: '' }), /归档项目/);
  assert.throws(() => database.saveTimer({ mode: 'stopwatch', state: 'paused', projectId: project.id, startedAt: null, elapsedSeconds: 0, plannedSeconds: null, note: '' }), /归档项目/);
}));

test('timer state and settings survive reads', async () => withDatabase((database) => {
  const timer = database.saveTimer({ mode: 'countdown', state: 'paused', projectId: null, startedAt: '2026-08-25T09:00:00.000Z', elapsedSeconds: 120, plannedSeconds: 300, note: '深度工作' });
  assert.equal(timer.plannedSeconds, 300);
  database.setSetting('ui', { floating: { visible: true } });
  assert.deepEqual(database.getSettings(), { ui: { floating: { visible: true } } });
}));

test('daily statistics use the requested local time-zone boundary', async () => withDatabase((database) => {
  database.createEntry({ projectId: null, startedAt: '2026-08-24T16:30:00.000Z', endedAt: '2026-08-24T17:00:00.000Z', mode: 'stopwatch', plannedSeconds: null, note: '凌晨记录' });
  assert.equal(database.statistics({ timeZone: 'Asia/Shanghai' }).daily[0].date, '2026-08-25');
  assert.equal(database.statistics({ timeZone: 'UTC' }).daily[0].date, '2026-08-24');
}));

test('project statistics aggregate descendants without mixing unrelated projects', async () => withDatabase((database) => {
  const root = database.createProject({ name: '根项目' });
  const child = database.createProject({ name: '子项目', parentId: root.id });
  const other = database.createProject({ name: '其他项目' });
  database.createEntry({ projectId: child.id, startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T09:30:00.000Z', mode: 'stopwatch', plannedSeconds: null, note: '' });
  database.createEntry({ projectId: other.id, startedAt: '2026-08-25T10:00:00.000Z', endedAt: '2026-08-25T11:00:00.000Z', mode: 'stopwatch', plannedSeconds: null, note: '' });
  assert.equal(database.statistics({ projectId: root.id, includeDescendants: true }).totalSeconds, 1800);
  assert.equal(database.statistics({ projectId: root.id }).totalSeconds, 0);
}));

test('exports can replace a local database atomically', async () => withDatabase((database) => {
  const project = database.createProject({ name: '可备份项目' });
  database.createEntry({ projectId: project.id, startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T09:30:00.000Z', mode: 'stopwatch', plannedSeconds: null, note: '备份记录' });
  const backup = database.exportData();
  database.createProject({ name: '临时项目' });
  database.importData(backup);
  assert.deepEqual(database.listProjects({ includeArchived: true }).map((item) => item.name), ['可备份项目']);
  assert.equal(database.listEntries()[0].note, '备份记录');
}));
