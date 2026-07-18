const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
let bundledFfmpeg = null;
try {
  bundledFfmpeg = require('ffmpeg-static');
  if (bundledFfmpeg && bundledFfmpeg.includes('app.asar')) bundledFfmpeg = bundledFfmpeg.replace('app.asar', 'app.asar.unpacked');
} catch {}
const ffmpegPath = process.env.FFMPEG_PATH || bundledFfmpeg || 'ffmpeg';

protocol.registerSchemesAsPrivileged([{ scheme: 'vodie-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const dataFile = () => path.join(app.getPath('userData'), 'project.json');
const secretFile = () => path.join(app.getPath('userData'), 'providers.bin');
const historyFile = () => path.join(app.getPath('userData'), 'history.json');
const mediaRoot = () => path.join(app.getPath('videos'), 'Vodie Studio');
const auth = (key, json = true) => ({ Authorization: `Bearer ${key}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });
const endpoint = (base, suffix) => `${String(base).replace(/\/$/, '')}${suffix}`;
const safeName = (value) => String(value || 'project').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80);
const mediaUrl = (file) => `vodie-media://local/${encodeURIComponent(file)}`;

async function jsonRequest(url, options = {}) {
  let res;
  try { res = await fetch(url, options); }
  catch (error) { throw new Error(`Request connection failed (${new URL(url).pathname}): ${error.cause?.message || error.message}`); }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { message: text }; }
  if (!res.ok) throw new Error(body?.error?.message || body?.message || `HTTP ${res.status}`);
  return body;
}
function extractJson(text) {
  const clean = String(text).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('GPT did not return valid JSON');
  return JSON.parse(clean.slice(start, end + 1));
}
async function saveSecrets(settings) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('System credential encryption is unavailable');
  const encrypted = safeStorage.encryptString(JSON.stringify(settings));
  await fs.writeFile(secretFile(), encrypted);
}
async function loadSecrets() {
  try { return JSON.parse(safeStorage.decryptString(await fs.readFile(secretFile()))); } catch { return null; }
}
async function projectDir(project) {
  const dir = path.join(mediaRoot(), `${safeName(project.title)}-${project.id || 'default'}`);
  await fs.mkdir(path.join(dir, 'scenes'), { recursive: true });
  return dir;
}
async function download(url, file, key) {
  let res;
  try { res = await net.fetch(url, { headers: key ? auth(key, false) : {} }); }
  catch (error) { throw new Error(`Video download connection failed: ${error.cause?.message || error.message}`); }
  if (!res.ok || !res.body) throw new Error(`Video download failed: HTTP ${res.status}`);
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
}
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
    let error = ''; child.stderr.on('data', d => error += d.toString());
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(error || `FFmpeg exited with ${code}`)));
  });
}
function srtTime(seconds) {
  const ms = Math.round(seconds * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), x = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(x).padStart(3,'0')}`;
}
function makeSrt(scenes) { let t = 0; return scenes.map((s, i) => { const start = t; t += Number(s.duration); return `${i + 1}\n${srtTime(start)} --> ${srtTime(t)}\n${String(s.narration || '').replace(/\r?\n/g, ' ')}\n`; }).join('\n'); }
async function optimizeVideoPrompt(project, scene) {
  const cfg = project.settings.gpt;
  const instruction = `Rewrite this scene as one concise English prompt for a video generation model. Put the visible subject, location, and exact action in the first sentence. The scene MUST visibly feature the described Chinese high-school student; never replace the subject with an empty landscape, mountains, a lake, abstract scenery, text, or unrelated people. Preserve continuity and realistic cinematic style. Do not add new symbols or locations. Return only the final prompt, under 900 characters. Scene title: ${scene.title}. Narration: ${scene.narration}. Source prompt: ${scene.prompt}. Global continuity: ${project.globalStyle}`;
  try {
    const body = await jsonRequest(endpoint(cfg.baseUrl, '/v1/chat/completions'), { method: 'POST', headers: auth(cfg.apiKey), body: JSON.stringify({ model: cfg.model, temperature: 0.2, messages: [{ role: 'system', content: 'You convert storyboards into precise, literal video-generation prompts.' }, { role: 'user', content: instruction }] }) });
    const prompt = String(body.choices?.[0]?.message?.content || '').replace(/^```\w*\s*|\s*```$/g, '').trim();
    return prompt || scene.prompt;
  } catch { return scene.prompt; }
}
function localSpeech(text, file) {
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile(${JSON.stringify(file)}); $s.Speak(${JSON.stringify(text)}); $s.Dispose()`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 120000 });
  if (result.status !== 0) throw new Error(`Local Windows TTS failed: ${String(result.stderr || '').trim()}`);
  return file;
}

ipcMain.handle('project:load', async () => {
  let project = null; try { project = JSON.parse(await fs.readFile(dataFile(), 'utf8')); } catch {}
  const settings = await loadSecrets(); return project ? { ...project, settings: settings || project.settings } : null;
});
ipcMain.handle('project:save', async (_, data) => {
  await saveSecrets(data.settings);
  const clean = structuredClone(data); clean.settings.gpt.apiKey = ''; clean.settings.grok.apiKey = '';
  await fs.writeFile(dataFile(), JSON.stringify(clean, null, 2));
  let history = []; try { history = JSON.parse(await fs.readFile(historyFile(), 'utf8')); } catch {}
  const entry = { id: clean.id, title: clean.title, updatedAt: new Date().toISOString(), stage: clean.stage, sceneCount: clean.scenes?.length || 0, exportPath: clean.exportPath || '' };
  history = [entry, ...history.filter(x => x.id !== entry.id)].slice(0, 50);
  await fs.writeFile(historyFile(), JSON.stringify(history, null, 2)); return true;
});
ipcMain.handle('history:list', async () => { try { return JSON.parse(await fs.readFile(historyFile(), 'utf8')); } catch { return []; } });
ipcMain.handle('provider:test', async (_, { provider, settings }) => {
  const cfg = settings[provider]; await jsonRequest(endpoint(cfg.baseUrl, '/v1/models'), { headers: auth(cfg.apiKey, false) }); return true;
});
ipcMain.handle('gpt:script', async (_, { brief, duration, ratio, settings }) => {
  const sceneCount = Math.max(2, Math.ceil(duration / 8));
  const prompt = `Create a complete Chinese screenplay and storyboard for: ${brief}. Total duration ${duration}s, aspect ratio ${ratio}, exactly ${sceneCount} continuous shots. Maintain character, location, lighting and art continuity. Return JSON only: {"title":"","summary":"","globalStyle":"","scenes":[{"title":"","duration":8,"narration":"","prompt":""}]}. Each prompt must be a detailed Chinese video-generation prompt containing the global continuity description.`;
  const cfg = settings.gpt;
  const body = await jsonRequest(endpoint(cfg.baseUrl, '/v1/chat/completions'), { method: 'POST', headers: auth(cfg.apiKey), body: JSON.stringify({ model: cfg.model, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'You are a professional Chinese screenwriter, storyboard artist, and production scheduler.' }, { role: 'user', content: prompt }] }) });
  const parsed = extractJson(body.choices?.[0]?.message?.content || '');
  if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) throw new Error('GPT returned an empty storyboard'); return parsed;
});
ipcMain.handle('gpt:revise', async (_, { project, message, history }) => {
  const cfg = project.settings.gpt;
  const current = { title: project.title, summary: project.summary, globalStyle: project.globalStyle, scenes: project.scenes.map(({ title, duration, narration, prompt }) => ({ title, duration, narration, prompt })) };
  const prompt = `The user is reviewing a Chinese video screenplay. Revise it according to the request while preserving any content not requested to change. Keep total duration near ${project.duration}s and aspect ratio ${project.ratio}. Return JSON only: {"reply":"brief Chinese explanation to user","title":"","summary":"","globalStyle":"","scenes":[{"title":"","duration":8,"narration":"","prompt":""}]}. Current screenplay: ${JSON.stringify(current)}. Recent conversation: ${JSON.stringify(history || [])}. User request: ${message}`;
  const body = await jsonRequest(endpoint(cfg.baseUrl, '/v1/chat/completions'), { method: 'POST', headers: auth(cfg.apiKey), body: JSON.stringify({ model: cfg.model, temperature: 0.6, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'You are the Chinese film director. Collaborate with the user and revise the screenplay precisely.' }, { role: 'user', content: prompt }] }) });
  const parsed = extractJson(body.choices?.[0]?.message?.content || '');
  if (!Array.isArray(parsed.scenes) || !parsed.scenes.length) throw new Error('GPT returned an empty revised storyboard'); return parsed;
});
ipcMain.handle('gpt:speech', async (_, { project, scene }) => {
  if (!scene.narration?.trim()) return null;
  const cfg = project.settings.gpt, dir = await projectDir(project), file = path.join(dir, 'scenes', `${scene.id}.mp3`);
  const res = await fetch(endpoint(cfg.baseUrl, '/v1/audio/speech'), { method: 'POST', headers: auth(cfg.apiKey), body: JSON.stringify({ model: cfg.ttsModel || 'gpt-4o-mini-tts', voice: cfg.voice || 'alloy', input: scene.narration, format: 'mp3' }) });
  if (!res.ok) { localSpeech(scene.narration, file.replace(/\.mp3$/i, '.wav')); return { localPath: file.replace(/\.mp3$/i, '.wav'), fallback: 'windows-speech' }; }
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer())); return { localPath: file };
});
ipcMain.handle('grok:video', async (_, { project, scene }) => {
  const cfg = project.settings.grok, dir = await projectDir(project), file = path.join(dir, 'scenes', `${scene.id}.mp4`);
  const videoModel = /imagine|video/i.test(cfg.model || '') ? cfg.model : 'grok-imagine-video';
  const usedPrompt = await optimizeVideoPrompt(project, scene);
  const created = await jsonRequest(endpoint(cfg.baseUrl, '/v1/videos/generations'), { method: 'POST', headers: auth(cfg.apiKey), body: JSON.stringify({ model: videoModel, prompt: usedPrompt, duration: scene.duration, aspect_ratio: project.ratio }) });
  const id = created.id || created.request_id || created.data?.id; if (!id) throw new Error('Grok relay did not return a task ID');
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const job = await jsonRequest(endpoint(cfg.baseUrl, `/v1/videos/${id}`), { headers: auth(cfg.apiKey, false) });
    if (['completed', 'succeeded', 'done'].includes(job.status)) {
      const url = job.url || job.video?.url || job.output?.url || job.data?.[0]?.url; if (!url) throw new Error('Completed Grok task has no video URL');
      await download(url, file, cfg.apiKey); return { id, localPath: file, url: mediaUrl(file), usedPrompt };
    }
    if (['failed', 'cancelled'].includes(job.status)) throw new Error(job.error?.message || 'Video generation failed');
  }
  throw new Error('Video generation timed out');
});
ipcMain.handle('project:compose', async (_, { project }) => {
  const scenes = project.scenes.filter(s => s.status === 'done' && s.localVideoPath); if (scenes.length !== project.scenes.length) throw new Error('Generate all scenes before export');
  const dir = await projectDir(project), normalized = [];
  const [width, height] = project.ratio === '9:16' ? [1080,1920] : project.ratio === '1:1' ? [1080,1080] : [1920,1080];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i], out = path.join(dir, 'scenes', `render-${String(i).padStart(3,'0')}.mp4`), hasAudio = !!s.localAudioPath;
    const args = ['-i', s.localVideoPath]; if (hasAudio) args.push('-i', s.localAudioPath); else args.push('-f','lavfi','-i','anullsrc=r=44100:cl=stereo');
    args.push('-t', String(s.duration), '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20');
    args.push('-map','0:v:0','-map','1:a:0','-c:a','aac','-shortest');
    args.push(out); await runFfmpeg(args); normalized.push(out);
  }
  const listFile = path.join(dir, 'concat.txt'), base = path.join(dir, 'picture.mp4'), srt = path.join(dir, 'subtitles.srt');
  await fs.writeFile(listFile, normalized.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')); await fs.writeFile(srt, makeSrt(scenes), 'utf8');
  await runFfmpeg(['-f','concat','-safe','0','-i',listFile,'-c','copy',base]);
  const chosen = await dialog.showSaveDialog({ title: 'Export long video', defaultPath: path.join(mediaRoot(), `${safeName(project.title)}.mp4`), filters: [{ name: 'MP4 Video', extensions: ['mp4'] }] });
  if (chosen.canceled || !chosen.filePath) return { canceled: true };
  await runFfmpeg(['-i',base,'-i',srt,'-map','0:v','-map','0:a','-map','1:0','-c:v','copy','-c:a','copy','-c:s','mov_text','-metadata:s:s:0','language=chi',chosen.filePath]);
  return { canceled: false, path: chosen.filePath };
});
ipcMain.handle('path:open', async (_, target) => shell.showItemInFolder(target));
ipcMain.handle('media:check', async () => new Promise(resolve => {
  const child = spawn(ffmpegPath, ['-version'], { windowsHide: true });
  child.on('error', error => resolve({ ok: false, path: ffmpegPath, error: error.message }));
  child.on('close', code => resolve({ ok: code === 0, path: ffmpegPath, error: code === 0 ? '' : `FFmpeg exited with ${code}` }));
}));

function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1100, minHeight: 720, backgroundColor: '#f4f5f7', titleBarStyle: 'hiddenInset', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  if (!app.isPackaged) win.loadURL('http://127.0.0.1:5173'); else win.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => { Menu.setApplicationMenu(null); protocol.handle('vodie-media', req => { const file = decodeURIComponent(new URL(req.url).pathname.slice(1)); return net.fetch(pathToFileURL(file).toString()); }); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
