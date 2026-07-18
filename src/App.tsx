import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  Download,
  Film,
  FolderOpen,
  LoaderCircle,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { HistoryEntry, Project, Scene, Settings } from "./types";

const defaults: Project = {
  id: crypto.randomUUID(),
  title: "未命名影片",
  brief: "",
  summary: "",
  globalStyle: "",
  duration: 120,
  ratio: "16:9",
  stage: 1,
  scenes: [],
  settings: {
    gpt: {
      baseUrl: "http://38.76.195.153:8088",
      apiKey: "",
      model: "gpt-5.6-luna",
      ttsModel: "gpt-4o-audio-preview",
      voice: "alloy",
    },
    grok: {
      baseUrl: "http://38.76.195.153:8088",
      apiKey: "",
      model: "grok-4.5",
    },
  },
};
const mockScript = (p: Project) => ({
  title: p.brief.slice(0, 18) || "城市苏醒之前",
  summary: "一支由连贯镜头构成的电影感叙事短片。",
  globalStyle: "写实电影质感，自然光，克制配色，人物与场景连续一致",
  scenes: Array.from(
    { length: Math.max(3, Math.ceil(p.duration / 20)) },
    (_, i) => ({
      title: `镜头 ${String(i + 1).padStart(2, "0")}`,
      duration: Math.min(
        10,
        Math.max(
          5,
          Math.round(p.duration / Math.max(3, Math.ceil(p.duration / 20))),
        ),
      ),
      narration: `第 ${i + 1} 幕的旁白，推动故事向前发展。`,
      prompt: `${p.brief}。第 ${i + 1} 个连续镜头，写实电影质感，自然光，稳定运镜，人物服装与场景保持一致，${p.ratio}。`,
    }),
  ),
});
const api = {
  load: async () =>
    window.vodie?.load() ??
    JSON.parse(localStorage.getItem("vodie-project") || "null"),
  save: async (p: Project) => {
    if (window.vodie) return window.vodie.save(p);
    localStorage.setItem("vodie-project", JSON.stringify(p));
    return true;
  },
  script: async (p: Project) =>
    window.vodie?.generateScript({
      brief: p.brief,
      duration: p.duration,
      ratio: p.ratio,
      settings: p.settings,
    }) ?? new Promise((r) => setTimeout(() => r(mockScript(p)), 900)),
  revise: async (p: Project, message: string, history: ChatMessage[]) =>
    window.vodie?.reviseScript({ project: p, message, history }) ??
    new Promise<any>((r) =>
      setTimeout(
        () =>
          r({
            reply: `已根据“${message}”调整剧本，请继续审阅。`,
            title: p.title,
            summary: p.summary,
            globalStyle: p.globalStyle,
            scenes: p.scenes,
          }),
        800,
      ),
    ),
  video: async (p: Project, s: Scene) =>
    window.vodie?.generateVideo({ project: p, scene: s }) ??
    new Promise<{ id: string; url: string; localPath: string; usedPrompt?: string }>((r) =>
      setTimeout(
        () =>
          r({
            id: crypto.randomUUID(),
            url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
            localPath: "",
          }),
        1600,
      ),
    ),
  image: async (p: Project, s: Scene) =>
    window.vodie?.generateImage({ project: p, scene: s }) ??
    Promise.resolve({ url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee", localPath: "", remoteUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee", usedPrompt: s.prompt }),
  speech: async (p: Project, s: Scene) =>
    window.vodie?.generateSpeech({ project: p, scene: s }) ??
    Promise.resolve(null),
  compose: async (p: Project) =>
    window.vodie?.compose({ project: p }) ??
    Promise.resolve({
      canceled: false,
      path: "浏览器模拟模式不执行 FFmpeg 导出",
    }),
  test: async (provider: keyof Settings, settings: Settings) =>
    window.vodie?.testProvider({ provider, settings }) ?? Promise.resolve(true),
  cancel: async () => window.vodie?.cancelVideo('cancel-all') ?? true,
  resetCancel: async () => window.vodie?.cancelVideo('reset') ?? true,
};

export default function App() {
  const [project, setProject] = useState<Project>(defaults);
  const [view, setView] = useState<"studio" | "settings" | "history">("studio");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRef = useRef(false);
  useEffect(() => {
    api.load().then((p) => p && setProject({ ...defaults, ...p }));
    window.vodie?.history().then(setHistory).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => api.save(project), 400);
    return () => clearTimeout(t);
  }, [project]);
  const total = useMemo(
    () => project.scenes.reduce((n, s) => n + Number(s.duration || 0), 0),
    [project.scenes],
  );
  const updateScene = (id: string, patch: Partial<Scene>) =>
    setProject((p) => ({
      ...p,
      scenes: p.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  async function generateScript() {
    if (!project.brief.trim()) return setNotice("请先写下影片主题");
    setBusy(true);
    setNotice("");
    try {
      const x: any = await api.script(project);
      setProject((p) => ({
        ...p,
        title: x.title,
        summary: x.summary,
        globalStyle: x.globalStyle,
        stage: 2,
        scenes: x.scenes.map((s: any) => ({
          ...s,
          id: crypto.randomUUID(),
          status: "draft",
        })),
      }));
      setChat([
        {
          role: "assistant",
          content: `初稿《${x.title}》已经完成。你可以直接告诉我需要修改的人物、情节、风格、旁白或镜头；确认满意后再生成视频。`,
        },
      ]);
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reviseScript(message: string) {
    const next = [...chat, { role: "user" as const, content: message }];
    setChat(next);
    setChatBusy(true);
    try {
      const x = await api.revise(project, message, next.slice(-8));
      setProject((p) => ({
        ...p,
        title: x.title,
        summary: x.summary,
        globalStyle: x.globalStyle,
        scenes: x.scenes.map((s: any, i: number) => ({
          ...s,
          id: p.scenes[i]?.id || crypto.randomUUID(),
          status: "draft",
        })),
      }));
      setChat((c) => [
        ...c,
        { role: "assistant", content: x.reply || "已完成修改，请继续审阅。" },
      ]);
    } catch (e: any) {
      setChat((c) => [
        ...c,
        { role: "assistant", content: `修改失败：${e.message}` },
      ]);
    } finally {
      setChatBusy(false);
    }
  }
  async function generateOne(scene: Scene) {
    updateScene(scene.id, { status: "generating", error: "", videoUrl: undefined, localVideoPath: undefined, localAudioPath: undefined });
    try {
      const image = await api.image(project, scene);
      const sceneWithImage = { ...scene, imageUrl: image.url, remoteImageUrl: image.remoteUrl, localImagePath: image.localPath, prompt: image.usedPrompt || scene.prompt };
      updateScene(scene.id, sceneWithImage);
      const [out, speech] = await Promise.all([
        api.video(project, sceneWithImage),
        api.speech(project, scene),
      ]);
      updateScene(scene.id, {
        status: "done",
        remoteJobId: out.id,
        videoUrl: out.url,
        prompt: out.usedPrompt || scene.prompt,
        imageUrl: image.url,
        remoteImageUrl: image.remoteUrl,
        localImagePath: image.localPath,
        localVideoPath: out.localPath,
        localAudioPath: speech?.localPath,
      });
    } catch (e: any) {
      updateScene(scene.id, { status: "failed", error: e.message });
    }
  }
  async function generateAll() {
    await api.resetCancel(); cancelRef.current = false; setCancelRequested(false);
    setProject((p) => ({ ...p, stage: 3 }));
    for (const scene of project.scenes.filter((s) => s.status !== "done"))
      { if (cancelRef.current) break; await generateOne(scene); }
  }
  async function cancelGeneration() { cancelRef.current = true; setCancelRequested(true); await api.cancel(); setNotice("已停止生成，已完成的镜头会保留。"); }
  async function exportVideo() {
    setBusy(true);
    setNotice("");
    try {
      const out = await api.compose(project);
      if (!out.canceled && out.path) {
        setProject((p) => ({ ...p, exportPath: out.path }));
        setNotice(`导出完成：${out.path}`);
      }
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  const done = project.scenes.filter((s) => s.status === "done").length;
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span>
            <Film size={20} />
          </span>
          幻梦视频
        </div>
        <nav>
          <button
            className={view === "studio" ? "active" : ""}
            onClick={() => setView("studio")}
          >
            <Clapperboard />
            创作台
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <SettingsIcon />
            中转设置
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => { setView("history"); window.vodie?.history().then(setHistory); }}>
            <RefreshCw />生成历史
          </button>
        </nav>
        <div className="aside-foot">
          <div className="provider">
            <i className={project.settings.gpt.baseUrl ? "on" : ""} />
            <span>GPT 调度</span>
            <b>{project.settings.gpt.baseUrl ? "已配置" : "未配置"}</b>
          </div>
          <div className="provider">
            <i className={project.settings.grok.baseUrl ? "on" : ""} />
            <span>Grok 视频</span>
            <b>{project.settings.grok.baseUrl ? "已配置" : "未配置"}</b>
          </div>
        </div>
      </aside>
      <main>
        {view === "settings" ? (
          <Settings project={project} setProject={setProject} />
        ) : view === "history" ? (
          <HistoryView entries={history} onOpen={(entry) => { setProject((p) => ({ ...p, title: entry.title, exportPath: entry.exportPath })); setView("studio"); }} />
        ) : (
          <>
            <header>
              <div>
                <span className="eyebrow">长视频工作区</span>
                <input
                  className="title-input"
                  value={project.title}
                  onChange={(e) =>
                    setProject({ ...project, title: e.target.value })
                  }
                />
              </div>
              <button
                className="icon-btn"
                title="保存项目"
                onClick={() => api.save(project)}
              >
                <Save />
              </button>
            </header>
            <div className="steps">
              <Step
                n="01"
                label="创意简报"
                active={project.stage === 1}
                done={project.stage > 1}
              />
              <ChevronRight />
              <Step
                n="02"
                label="剧本与分镜"
                active={project.stage === 2}
                done={project.stage > 2}
              />
              <ChevronRight />
              <Step n="03" label="生成与导出" active={project.stage === 3} />
            </div>
            {notice && (
              <div className="notice">
                <CircleAlert /> {notice}
              </div>
            )}
            {project.stage === 1 ? (
              <Brief
                project={project}
                setProject={setProject}
                busy={busy}
                run={generateScript}
              />
            ) : (
              <Storyboard
                project={project}
                setProject={setProject}
                total={total}
                done={done}
                busy={busy}
                chat={chat}
                chatBusy={chatBusy}
                revise={reviseScript}
                update={updateScene}
                generateAll={generateAll}
                onConfirm={generateAll}
                generateOne={generateOne}
                exportVideo={exportVideo}
                cancelGeneration={cancelGeneration}
                cancelRequested={cancelRequested}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
type ChatMessage = { role: "user" | "assistant"; content: string };
function HistoryView({ entries, onOpen }: { entries: HistoryEntry[]; onOpen: (entry: HistoryEntry) => void }) {
  return <section className="history-view"><div className="settings-head"><span className="eyebrow">项目记录</span><h1>生成历史</h1><p>最近保存的项目和成片导出记录。</p></div>{entries.length ? <div className="history-list">{entries.map((entry) => <button className="history-row" key={entry.id} onClick={() => onOpen(entry)}><span className="history-mark"><Film /></span><span className="history-main"><b>{entry.title || '未命名影片'}</b><small>{new Date(entry.updatedAt).toLocaleString()} · {entry.sceneCount} 个镜头</small></span><span className={`status ${entry.stage >= 3 ? 'done' : ''}`}>{entry.exportPath ? '已导出' : entry.stage >= 3 ? '生成中' : '草稿'}</span><ChevronRight /></button>)}</div> : <div className="history-empty"><Film/><b>还没有生成记录</b><span>完成一次剧本或视频生成后，记录会显示在这里。</span></div>}</section>;
}
function Step({
  n,
  label,
  active,
  done,
}: {
  n: string;
  label: string;
  active: boolean;
  done?: boolean;
}) {
  return (
    <div className={`step ${active ? "active" : ""} ${done ? "done" : ""}`}>
      <span>{done ? <Check /> : n}</span>
      {label}
    </div>
  );
}
function Brief({
  project,
  setProject,
  busy,
  run,
}: {
  project: Project;
  setProject: (p: Project) => void;
  busy: boolean;
  run: () => void;
}) {
  return (
    <section className="brief">
      <div className="section-head">
        <span className="section-icon">
          <WandSparkles />
        </span>
        <div>
          <h2>从一个想法开始</h2>
          <p>GPT 将担任编剧和总导演，建立贯穿全片的视觉连续性。</p>
        </div>
      </div>
      <label>影片主题与创作要求</label>
      <textarea
        autoFocus
        value={project.brief}
        onChange={(e) => setProject({ ...project, brief: e.target.value })}
        placeholder="例如：制作一部关于上海凌晨面包师的纪录短片。叙事温暖克制，跟随主人公从备料到第一位客人进店……"
      />
      <div className="controls">
        <div>
          <label>目标时长</label>
          <select
            value={project.duration}
            onChange={(e) =>
              setProject({ ...project, duration: +e.target.value })
            }
          >
            <option value="60">1 分钟</option>
            <option value="120">2 分钟</option>
            <option value="300">5 分钟</option>
            <option value="600">10 分钟</option>
          </select>
        </div>
        <div>
          <label>画面比例</label>
          <div className="segments">
            {["16:9", "9:16", "1:1"].map((x) => (
              <button
                className={project.ratio === x ? "active" : ""}
                onClick={() => setProject({ ...project, ratio: x })}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className="primary" disabled={busy} onClick={run}>
        {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
        {busy ? "正在构思全片…" : "生成剧本与分镜"}
      </button>
    </section>
  );
}
function Storyboard({
  project,
  setProject,
  total,
  done,
  busy,
  chat,
  chatBusy,
  revise,
  update,
  generateAll,
  onConfirm,
  generateOne,
  exportVideo,
  cancelGeneration,
  cancelRequested,
}: {
  project: Project;
  setProject: (p: Project) => void;
  total: number;
  done: number;
  busy: boolean;
  chat: ChatMessage[];
  chatBusy: boolean;
  revise: (message: string) => void;
  update: (id: string, p: Partial<Scene>) => void;
  generateAll: () => void;
  onConfirm: () => void;
  generateOne: (s: Scene) => void;
  exportVideo: () => void;
  cancelGeneration: () => void;
  cancelRequested: boolean;
}) {
  const percent = project.scenes.length
    ? Math.round((done / project.scenes.length) * 100)
    : 0;
  return (
    <section>
      <div className="story-head">
        <div>
          <span className="eyebrow">
            {project.scenes.length} 个镜头 · {total} 秒
          </span>
          <h2>{project.stage === 2 ? "审阅全片分镜" : "视频生成队列"}</h2>
          <p>{project.summary}</p>
        </div>
        <div className="head-actions">
          {project.stage === 3 && <button className="secondary stop-generation" onClick={cancelGeneration} disabled={cancelRequested || done === project.scenes.length}><CircleAlert />{cancelRequested ? "已停止" : "停止生成"}</button>}
          <button
            className="secondary export"
            onClick={exportVideo}
            disabled={done !== project.scenes.length || busy}
          >
            {busy ? <LoaderCircle className="spin" /> : <Download />}导出成片
          </button>
          <button
            className="primary"
            onClick={generateAll}
            disabled={!project.scenes.length || done === project.scenes.length}
          >
            <Play />
            {project.stage === 2
              ? "确认并生成全部"
              : `继续生成 ${project.scenes.length - done} 个镜头`}
          </button>
        </div>
      </div>
      {project.stage === 3 && (
        <div className="generation-progress">
          <div>
            <b>全片生成进度</b>
            <span>
              {done} / {project.scenes.length} 个镜头 · {percent}%
            </span>
          </div>
          <div className="progress-track">
            <i style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      {project.stage === 2 && (
        <>
        <ScriptChat messages={chat} busy={chatBusy} onSend={revise} onConfirm={onConfirm} />
        <button className="confirm-script" onClick={onConfirm} disabled={chatBusy || !chat.length}><Check />确认剧本，自动开始生成视频</button>
        </>
      )}
      {project.exportPath && (
        <button
          className="export-result"
          onClick={() => window.vodie?.openPath(project.exportPath!)}
        >
          <FolderOpen />
          打开成片位置 <span>{project.exportPath}</span>
        </button>
      )}
      {project.globalStyle && (
        <div className="style-line">
          <Sparkles />
          <b>全局视觉锚点</b>
          <span>{project.globalStyle}</span>
        </div>
      )}
      <div className="scene-list">
        {project.scenes.map((s, i) => (
          <article className="scene" key={s.id}>
            <div className="shot">
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s.videoUrl ? (
                <video src={s.videoUrl} muted controls />
              ) : s.imageUrl ? (
                <img src={s.imageUrl} alt={`${s.title} 关键帧`} />
              ) : (
                <div className={`placeholder ${s.status}`}>
                  <Clapperboard />
                  {s.status === "generating"
                    ? "视频与配音生成中"
                    : s.status === "failed"
                      ? "生成失败"
                      : "等待生成"}
                </div>
              )}
            </div>
            <div className="scene-body">
              <div className="scene-top">
                <input
                  value={s.title}
                  onChange={(e) => update(s.id, { title: e.target.value })}
                />
                <span className={`status ${s.status}`}>
                  {s.status === "done"
                    ? "音画已完成"
                    : s.status === "generating"
                      ? "生成中"
                      : s.status === "failed"
                        ? "失败"
                        : "草稿"}
                </span>
              </div>
              <label>旁白</label>
              <textarea
                value={s.narration}
                onChange={(e) =>
                  update(s.id, {
                    narration: e.target.value,
                    status: "draft",
                    localAudioPath: undefined,
                  })
                }
              />
              <label>Grok 视频提示词</label>
              <textarea
                className="prompt"
                value={s.prompt}
                onChange={(e) =>
                  update(s.id, {
                    prompt: e.target.value,
                    status: "draft",
                    localVideoPath: undefined,
                    videoUrl: undefined,
                  })
                }
              />
              {s.error && <small className="error">{s.error}</small>}
              <div className="scene-actions">
                <label>
                  时长{" "}
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={s.duration}
                    onChange={(e) =>
                      update(s.id, {
                        duration: +e.target.value,
                        status: "draft",
                      })
                    }
                  />{" "}
                  秒
                </label>
                <button
                  className="secondary"
                  onClick={() => generateOne(s)}
                  disabled={s.status === "generating"}
                >
                  <RefreshCw />
                  {s.status === "done" ? "重新生成" : "生成镜头"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <button
        className="add"
        onClick={() =>
          setProject({
            ...project,
            scenes: [
              ...project.scenes,
              {
                id: crypto.randomUUID(),
                title: "新镜头",
                duration: 8,
                narration: "",
                prompt: project.globalStyle,
                status: "draft",
              },
            ],
          })
        }
      >
        <Plus />
        添加镜头
      </button>
    </section>
  );
}
function ScriptChat({ messages, busy, onSend, onConfirm }: { messages: ChatMessage[]; busy: boolean; onSend: (message: string) => void; onConfirm: () => void }) {
  const [input, setInput] = useState("");
  const submit = () => { const value = input.trim(); if (!value || busy) return; setInput(""); onSend(value); };
  return <div className="script-chat">
    <div className="chat-title"><MessageSquare/><div><b>与 GPT 导演确认剧本</b><span>提出修改，满意后再生成视频</span></div></div>
    <div className="chat-messages">{messages.map((message,index)=><div key={index} className={`chat-message ${message.role}`}><span>{message.role==='assistant'?'GPT 导演':'你'}</span><p>{message.content}</p></div>)}{busy&&<div className="chat-message assistant"><span>GPT 导演</span><p><LoaderCircle className="spin"/>正在修改剧本…</p></div>}</div>
    <div className="chat-input"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}}} placeholder="例如：让修仙异象更克制，结尾增加同学们的反应…"/><button onClick={submit} disabled={!input.trim()||busy} title="发送修改要求"><Send/></button></div>
  </div>;
}
function Settings({
  project,
  setProject,
}: {
  project: Project;
  setProject: (p: Project) => void;
}) {
  const [states, setStates] = useState<Record<string, string>>({});
  const [media, setMedia] = useState("检测中…");
  useEffect(() => {
    window.vodie
      ?.mediaCheck()
      .then((x) =>
        setMedia(
          x.ok ? `FFmpeg 就绪 (${x.path})` : `FFmpeg 不可用：${x.error}`,
        ),
      )
      .catch(() => setMedia("浏览器模式未检测"));
  }, []);
  const set = (provider: keyof Settings, key: string, value: string) =>
    setProject({
      ...project,
      settings: {
        ...project.settings,
        [provider]: { ...project.settings[provider], [key]: value },
      },
    });
  const test = async (provider: keyof Settings) => {
    setStates((s) => ({ ...s, [provider]: "测试中…" }));
    try {
      await api.test(provider, project.settings);
      setStates((s) => ({ ...s, [provider]: "连接成功" }));
    } catch (e: any) {
      setStates((s) => ({ ...s, [provider]: e.message }));
    }
  };
  return (
    <section>
      <div className="settings-head">
        <span className="eyebrow">供应商配置</span>
        <h1>两条通道，各司其职</h1>
        <p>
          GPT 负责编剧、调度与配音；Grok 专注生成视频。凭据由 Windows 加密保存。
        </p>
      </div>
      <div className="settings-grid">
        <ProviderCard
          name="GPT 调度中转"
          note="剧本 · 分镜 · TTS 配音"
          accent="green"
          data={project.settings.gpt}
          result={states.gpt}
          onTest={() => test("gpt")}
          onChange={(k, v) => set("gpt", k, v)}
          extras={
            <>
              <label>TTS 模型</label>
              <input
                value={project.settings.gpt.ttsModel || ""}
                onChange={(e) => set("gpt", "ttsModel", e.target.value)}
              />
              <label>声音</label>
              <input
                value={project.settings.gpt.voice || ""}
                onChange={(e) => set("gpt", "voice", e.target.value)}
              />
            </>
          }
        />
        <ProviderCard
          name="Grok 视频中转"
          note="镜头生成 · 异步任务轮询"
          accent="red"
          data={project.settings.grok}
          result={states.grok}
          onTest={() => test("grok")}
          onChange={(k, v) => set("grok", k, v)}
        />
      </div>
      <div className="protocol">
        <h3>接口约定</h3>
        <code>GPT POST /v1/chat/completions</code>
        <code>GPT POST /v1/audio/speech</code>
      <code>Grok POST /v1/videos/generations</code>
      <code>Grok GET /v1/videos/&#123;request_id&#125;</code>
        <p className="media-status">{media}</p>
      </div>
    </section>
  );
}
function ProviderCard({
  name,
  note,
  accent,
  data,
  onChange,
  onTest,
  result,
  extras,
}: {
  name: string;
  note: string;
  accent: string;
  data: any;
  onChange: (k: string, v: string) => void;
  onTest: () => void;
  result?: string;
  extras?: React.ReactNode;
}) {
  return (
    <div className={`provider-card ${accent}`}>
      <div className="provider-title">
        <span>{name[0]}</span>
        <div>
          <h2>{name}</h2>
          <p>{note}</p>
        </div>
      </div>
      <label>Base URL</label>
      <input
        placeholder="https://api.example.com"
        value={data.baseUrl}
        onChange={(e) => onChange("baseUrl", e.target.value)}
      />
      <label>API Key</label>
      <input
        type="password"
        placeholder="sk-••••••••••••"
        value={data.apiKey}
        onChange={(e) => onChange("apiKey", e.target.value)}
      />
      <label>模型名称</label>
      <input
        value={data.model}
        onChange={(e) => onChange("model", e.target.value)}
      />
      {extras}
      <div className="card-foot">
        <i className={data.baseUrl && data.apiKey ? "on" : ""} />
        <span>
          {result || (data.baseUrl && data.apiKey ? "配置完整" : "等待配置")}
        </span>
        <button
          className="secondary test-btn"
          disabled={!data.baseUrl || !data.apiKey}
          onClick={onTest}
        >
          测试连接
        </button>
      </div>
    </div>
  );
}
