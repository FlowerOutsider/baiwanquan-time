import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { Database } from './database.js';
import { ValidationError, assertObject, enumValue, id, integer, isoTime, optionalIsoTime, optionalText, text } from './validation.js';

const database = new Database(config.dataFile);

const json = (response, status, body) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
};

const notFound = (response) => json(response, 404, { error: { code: 'NOT_FOUND', message: '资源不存在' } });

const readJson = (request) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > config.bodyLimit) { reject(new ValidationError('请求体过大')); request.destroy(); return; }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (!chunks.length) return resolve({});
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new ValidationError('请求体不是有效 JSON')); }
  });
  request.on('error', reject);
});

const validateEntry = (body, existing = {}) => {
  const value = assertObject(body);
  const startedAt = value.startedAt === undefined ? existing.startedAt : isoTime(value.startedAt, 'startedAt');
  const endedAt = value.endedAt === undefined ? existing.endedAt : isoTime(value.endedAt, 'endedAt');
  if (Date.parse(endedAt) < Date.parse(startedAt)) throw new ValidationError('结束时间不能早于开始时间');
  return {
    projectId: value.projectId === undefined ? (existing.projectId ?? null) : (value.projectId === null ? null : id(value.projectId, 'projectId')),
    startedAt, endedAt,
    mode: value.mode === undefined ? (existing.mode ?? 'stopwatch') : enumValue(value.mode, 'mode', ['stopwatch', 'countdown']),
    plannedSeconds: value.plannedSeconds === undefined ? (existing.plannedSeconds ?? null) : (value.plannedSeconds === null ? null : integer(value.plannedSeconds, 'plannedSeconds', { min: 1, max: 86400 })),
    note: value.note === undefined ? (existing.note ?? '') : text(value.note, 'note', { max: 4000 }),
  };
};

const validateTimer = (body, existing) => {
  const value = assertObject(body);
  const next = {
    mode: value.mode === undefined ? existing.mode : enumValue(value.mode, 'mode', ['stopwatch', 'countdown']),
    state: value.state === undefined ? existing.state : enumValue(value.state, 'state', ['idle', 'running', 'paused']),
    projectId: value.projectId === undefined ? existing.projectId : (value.projectId === null ? null : id(value.projectId, 'projectId')),
    startedAt: value.startedAt === undefined ? existing.startedAt : optionalIsoTime(value.startedAt, 'startedAt'),
    elapsedSeconds: value.elapsedSeconds === undefined ? existing.elapsedSeconds : integer(value.elapsedSeconds, 'elapsedSeconds', { min: 0, max: 31_536_000 }),
    plannedSeconds: value.plannedSeconds === undefined ? existing.plannedSeconds : (value.plannedSeconds === null ? null : integer(value.plannedSeconds, 'plannedSeconds', { min: 1, max: 86400 })),
    note: value.note === undefined ? existing.note : text(value.note, 'note', { max: 4000 }),
  };
  if (next.mode === 'countdown' && !next.plannedSeconds) throw new ValidationError('倒计时必须有计划时长');
  if (next.state === 'running' && !next.startedAt) throw new ValidationError('运行中的计时器必须有开始时间');
  return next;
};

const serveStatic = (request, response) => {
  if (!fs.existsSync(config.staticDir)) return json(response, 503, { error: { code: 'FRONTEND_NOT_BUILT', message: '前端尚未构建，请先执行 npm run build' } });
  const rawPath = new URL(request.url, 'http://localhost').pathname;
  const relative = rawPath === '/' ? 'index.html' : rawPath.replace(/^\/+/, '');
  const staticFile = path.resolve(config.staticDir, relative);
  const relativeToStatic = path.relative(config.staticDir, staticFile);
  const escapesStaticDir = relativeToStatic.startsWith('..') || path.isAbsolute(relativeToStatic);
  // 计时按钮会在运行时切换原始 PNG 名称；生产构建后的哈希文件不能满足该引用，
  // 因此仅对受限的 assets 路径回退到随应用打包的原始资源目录。
  const sourceAsset = relative.startsWith('assets/') ? path.resolve(config.rootDir, relative) : null;
  const assetInsideRoot = sourceAsset && !path.relative(config.rootDir, sourceAsset).startsWith('..');
  const file = !escapesStaticDir && fs.existsSync(staticFile) && !fs.statSync(staticFile).isDirectory()
    ? staticFile
    : (assetInsideRoot && fs.existsSync(sourceAsset) && !fs.statSync(sourceAsset).isDirectory() ? sourceAsset : null);
  if (!file) {
    return fs.createReadStream(path.join(config.staticDir, 'index.html')).pipe(response);
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(response);
};

const route = async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const method = request.method;
  if (!url.pathname.startsWith('/api/v1/')) return serveStatic(request, response);
  if (method === 'GET' && url.pathname === '/api/v1/health') return json(response, 200, { status: 'ok', now: new Date().toISOString() });
  if (method === 'GET' && url.pathname === '/api/v1/bootstrap') return json(response, 200, { projects: database.listProjects({ includeArchived: true }), entries: database.listEntries({}), timer: database.getTimer(), settings: database.getSettings() });
  if (method === 'GET' && url.pathname === '/api/v1/projects') return json(response, 200, { projects: database.listProjects({ includeArchived: url.searchParams.get('includeArchived') === 'true' }) });
  if (method === 'POST' && url.pathname === '/api/v1/projects') {
    const body = assertObject(await readJson(request));
    return json(response, 201, { project: database.createProject({ name: text(body.name, 'name', { min: 1, max: 120 }), parentId: body.parentId === undefined || body.parentId === null ? null : id(body.parentId, 'parentId'), description: body.description === undefined ? '' : text(body.description, 'description', { max: 4000 }) }) });
  }
  const projectMatch = url.pathname.match(/^\/api\/v1\/projects\/([^/]+)(?:\/(archive|restore))?$/);
  if (projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]); const action = projectMatch[2];
    if (method === 'PATCH' && !action) {
      const body = assertObject(await readJson(request)); const changes = {};
      if (body.name !== undefined) changes.name = text(body.name, 'name', { min: 1, max: 120 });
      if (body.description !== undefined) changes.description = text(body.description, 'description', { max: 4000 });
      return database.getProject(projectId) ? json(response, 200, { project: database.updateProject(projectId, changes) }) : notFound(response);
    }
    if (method === 'POST' && action) {
      const project = database.archiveProject(projectId, action === 'archive');
      return project ? json(response, 200, { project }) : notFound(response);
    }
  }
  if (method === 'GET' && url.pathname === '/api/v1/time-entries') return json(response, 200, { entries: database.listEntries({ from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined, projectId: url.searchParams.has('projectId') ? url.searchParams.get('projectId') || null : undefined }) });
  if (method === 'GET' && url.pathname === '/api/v1/statistics') {
    const timeZone = url.searchParams.get('timeZone') || 'UTC';
    try { new Intl.DateTimeFormat('en-CA', { timeZone }).format(); } catch { throw new ValidationError('timeZone必须是有效的 IANA 时区'); }
    return json(response, 200, { statistics: database.statistics({ from: url.searchParams.get('from') ?? undefined, to: url.searchParams.get('to') ?? undefined, projectId: url.searchParams.has('projectId') ? url.searchParams.get('projectId') || null : undefined, includeDescendants: url.searchParams.get('includeDescendants') === 'true', timeZone }) });
  }
  if (method === 'POST' && url.pathname === '/api/v1/time-entries') return json(response, 201, { entry: database.createEntry(validateEntry(await readJson(request))) });
  const entryMatch = url.pathname.match(/^\/api\/v1\/time-entries\/([^/]+)$/);
  if (entryMatch) {
    const entryId = decodeURIComponent(entryMatch[1]);
    if (method === 'PATCH') {
      const current = database.listEntries({}).find((entry) => entry.id === entryId);
      return current ? json(response, 200, { entry: database.updateEntry(entryId, validateEntry(await readJson(request), current)) }) : notFound(response);
    }
    if (method === 'DELETE') return database.deleteEntry(entryId) ? json(response, 204, {}) : notFound(response);
  }
  if (method === 'GET' && url.pathname === '/api/v1/timer') return json(response, 200, { timer: database.getTimer() });
  if (method === 'PUT' && url.pathname === '/api/v1/timer') return json(response, 200, { timer: database.saveTimer(validateTimer(await readJson(request), database.getTimer())) });
  if (method === 'GET' && url.pathname === '/api/v1/settings') return json(response, 200, { settings: database.getSettings() });
  const settingMatch = url.pathname.match(/^\/api\/v1\/settings\/([^/]+)$/);
  if (settingMatch && method === 'PUT') { const body = assertObject(await readJson(request)); database.setSetting(decodeURIComponent(settingMatch[1]), body.value); return json(response, 204, {}); }
  if (method === 'GET' && url.pathname === '/api/v1/export') return json(response, 200, database.exportData());
  if (method === 'POST' && url.pathname === '/api/v1/import') {
    const body = assertObject(await readJson(request));
    if (body.replace !== true) throw new ValidationError('导入会替换本地数据；请显式传入 replace: true');
    return json(response, 200, database.importData(body.data));
  }
  return notFound(response);
};

export const server = http.createServer(async (request, response) => {
  try { await route(request, response); }
  catch (error) {
    if (error instanceof ValidationError) return json(response, 400, { error: { code: 'VALIDATION_ERROR', message: error.message } });
    console.error(error);
    return json(response, 500, { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
  }
});

export const closeDatabase = () => database.close();

// Electron 主进程以模块方式导入时不会提供 argv[1]；仅直接执行此文件时启动独立 HTTP 服务。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(config.port, config.host, () => console.log(`百万拳本地服务：http://${config.host}:${config.port}`));
}
