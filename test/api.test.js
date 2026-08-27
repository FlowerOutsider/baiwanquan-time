import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('HTTP API creates, archives, and exports local data', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baiwanquan-api-test-'));
  process.env.BAIWANQUAN_DB = path.join(directory, 'api.sqlite');
  process.env.PORT = '0';
  const { server, closeDatabase } = await import(`../server/app.js?test=${Date.now()}`);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
  const request = async (pathName, options) => {
    const response = await fetch(`${baseUrl}${pathName}`, options);
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const health = await request('/health');
    assert.equal(health.body.status, 'ok');
    const root = await request('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '根项目' }) });
    const child = await request('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '子项目', parentId: root.body.project.id }) });
    assert.equal(child.status, 201);
    const entry = await request('/time-entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: child.body.project.id, startedAt: '2026-08-25T09:00:00.000Z', endedAt: '2026-08-25T10:00:00.000Z', mode: 'stopwatch', note: 'API 记录' }) });
    assert.equal(entry.body.entry.projectId, child.body.project.id);
    await request(`/projects/${root.body.project.id}/archive`, { method: 'POST' });
    const exported = await request('/export');
    assert.equal(exported.body.projects.filter((project) => project.status === 'archived').length, 2);
    assert.equal(exported.body.entries.length, 1);
    const statistics = await request('/statistics?from=2026-08-25T00:00:00.000Z&to=2026-08-25T23:59:59.999Z');
    assert.equal(statistics.body.statistics.totalSeconds, 3600);
    assert.deepEqual(statistics.body.statistics.daily, [{ date: '2026-08-25', seconds: 3600, entries: 1 }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
