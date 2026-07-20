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
  title: "鏈懡鍚嶅奖鐗?,
  brief: "",
  summary: "",
  globalStyle: "",
  duration: 120,
  ratio: "16:9",
  stage: 1,
  scenes: [],
  settings: {
    deepseek: {
      baseUrl: "https://api.deepseek.com",
      apiKey: "",
      model: "deepseek-chat",
    },
    grok: {
      baseUrl: "https://api.x.ai",
      apiKey: "",
      model: "grok-2-1212",
    },
  },
};
const mockScript = (p: Project) => ({
  title: p.brief.slice(0, 18) || "鍩庡競鑻忛啋涔嬪墠",
  summary: "涓€鏀敱杩炶疮闀滃ご鏋勬垚鐨勭數褰辨劅鍙欎簨鐭墖銆?,
  globalStyle: "鍐欏疄鐢靛奖璐ㄦ劅锛岃嚜鐒跺厜锛屽厠鍒堕厤鑹诧紝浜虹墿涓庡満鏅繛缁竴鑷?,
  scenes: Array.from(
    { length: Math.max(3, Math.ceil(p.duration / 20)) },
    (_, i) => ({
      title: `闀滃ご ${String(i + 1).padStart(2, "0")}`,
      duration: Math.min(
        10,
        Math.max(
          5,
          Math.round(p.duration / Math.max(3, Math.ceil(p.duration / 20))),
        ),
      ),
      narration: `绗?${i + 1} 骞曠殑鏃佺櫧锛屾帹鍔ㄦ晠浜嬪悜鍓嶅彂灞曘€俙,
      prompt: `${p.brief}銆傜 ${i + 1} 涓繛缁暅澶达紝鍐欏疄鐢靛奖璐ㄦ劅锛岃嚜鐒跺厜锛岀ǔ瀹氳繍闀滐紝浜虹墿鏈嶈涓庡満鏅繚鎸佷竴鑷达紝${p.ratio}銆俙,
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
            reply: `宸叉牴鎹€?{message}鈥濊皟鏁村墽鏈紝璇风户缁闃呫€俙,
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
      path: "娴忚鍣ㄦā鎷熸ā寮忎笉鎵ц FFmpeg 瀵煎嚭",
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
    if (!project.brief.trim()) return setNotice("璇峰厛鍐欎笅褰辩墖涓婚");
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
          content: `鍒濈銆?{x.title}銆嬪凡缁忓畬鎴愩€備綘鍙互鐩存帴鍛婅瘔鎴戦渶瑕佷慨鏀圭殑浜虹墿銆佹儏鑺傘€侀鏍笺€佹梺鐧芥垨闀滃ご锛涚‘璁ゆ弧鎰忓悗鍐嶇敓鎴愯棰戙€俙,
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
        { role: "assistant", content: x.reply || "宸插畬鎴愪慨鏀癸紝璇风户缁闃呫€? },
      ]);
    } catch (e: any) {
      setChat((c) => [
        ...c,
        { role: "assistant", content: `淇敼澶辫触锛?{e.message}` },
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
  async function cancelGeneration() { cancelRef.current = true; setCancelRequested(true); await api.cancel(); setNotice("宸插仠姝㈢敓鎴愶紝宸插畬鎴愮殑闀滃ご浼氫繚鐣欍€?); }
  async function createNewProject() {
    await api.cancel(); cancelRef.current = false; setCancelRequested(false); setChat([]); setNotice("");
    setProject({ ...defaults, id: crypto.randomUUID(), settings: project.settings });
    setView("studio"); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function exportVideo() {
    setBusy(true);
    setNotice("");
    try {
      const out = await api.compose(project);
      if (!out.canceled && out.path) {
        setProject((p) => ({ ...p, exportPath: out.path }));
        setNotice(`瀵煎嚭瀹屾垚锛?{out.path}`);
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
          骞绘ⅵ瑙嗛
        </div>
        <nav>
          <button className="new-project" onClick={createNewProject}><Plus />鏂板缓鍒涗綔</button>
          <button
            className={view === "studio" ? "active" : ""}
            onClick={() => setView("studio")}
          >
            <Clapperboard />
            鍒涗綔鍙?          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <SettingsIcon />
            涓浆璁剧疆
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => { setView("history"); window.vodie?.history().then(setHistory); }}>
            <RefreshCw />鐢熸垚鍘嗗彶
          </button>
        </nav>
        <div className="aside-foot">
          <div className="provider">
            <i className={project.settings.deepseek.baseUrl ? "on" : ""} />
            <span>DeepSeek 璋冨害</span>
            <b>{project.settings.deepseek.baseUrl ? "宸查厤缃? : "鏈厤缃?}</b>
          </div>
          <div className="provider">
            <i className={project.settings.grok.baseUrl ? "on" : ""} />
            <span>Grok 瑙嗛</span>
            <b>{project.settings.grok.baseUrl ? "宸查厤缃? : "鏈厤缃?}</b>
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
                <span className="eyebrow">闀胯棰戝伐浣滃尯</span>
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
                title="淇濆瓨椤圭洰"
                onClick={() => api.save(project)}
              >
                <Save />
              </button>
            </header>
            <div className="steps">
              <Step
                n="01"
                label="鍒涙剰绠€鎶?
                active={project.stage === 1}
                done={project.stage > 1}
              />
              <ChevronRight />
              <Step
                n="02"
                label="鍓ф湰涓庡垎闀?
                active={project.stage === 2}
                done={project.stage > 2}
              />
              <ChevronRight />
              <Step n="03" label="鐢熸垚涓庡鍑? active={project.stage === 3} />
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
  return <section className="history-view"><div className="settings-head"><span className="eyebrow">椤圭洰璁板綍</span><h1>鐢熸垚鍘嗗彶</h1><p>鏈€杩戜繚瀛樼殑椤圭洰鍜屾垚鐗囧鍑鸿褰曘€?/p></div>{entries.length ? <div className="history-list">{entries.map((entry) => <button className="history-row" key={entry.id} onClick={() => onOpen(entry)}><span className="history-mark"><Film /></span><span className="history-main"><b>{entry.title || '鏈懡鍚嶅奖鐗?}</b><small>{new Date(entry.updatedAt).toLocaleString()} 路 {entry.sceneCount} 涓暅澶?/small></span><span className={`status ${entry.stage >= 3 ? 'done' : ''}`}>{entry.exportPath ? '宸插鍑? : entry.stage >= 3 ? '鐢熸垚涓? : '鑽夌'}</span><ChevronRight /></button>)}</div> : <div className="history-empty"><Film/><b>杩樻病鏈夌敓鎴愯褰?/b><span>瀹屾垚涓€娆″墽鏈垨瑙嗛鐢熸垚鍚庯紝璁板綍浼氭樉绀哄湪杩欓噷銆?/span></div>}</section>;
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
          <h2>浠庝竴涓兂娉曞紑濮?/h2>
          <p>DeepSeek 灏嗘媴浠荤紪鍓у拰鎬诲婕旓紝寤虹珛璐┛鍏ㄧ墖鐨勮瑙夎繛缁€с€?/p>
        </div>
      </div>
      <label>褰辩墖涓婚涓庡垱浣滆姹?/label>
      <textarea
        autoFocus
        value={project.brief}
        onChange={(e) => setProject({ ...project, brief: e.target.value })}
        placeholder="渚嬪锛氬埗浣滀竴閮ㄥ叧浜庝笂娴峰噷鏅ㄩ潰鍖呭笀鐨勭邯褰曠煭鐗囥€傚彊浜嬫俯鏆栧厠鍒讹紝璺熼殢涓讳汉鍏粠澶囨枡鍒扮涓€浣嶅浜鸿繘搴椻€︹€?
      />
      <div className="controls">
        <div>
          <label>鐩爣鏃堕暱</label>
          <select
            value={project.duration}
            onChange={(e) =>
              setProject({ ...project, duration: +e.target.value })
            }
          >
            <option value="60">1 鍒嗛挓</option>
            <option value="120">2 鍒嗛挓</option>
            <option value="300">5 鍒嗛挓</option>
            <option value="600">10 鍒嗛挓</option>
          </select>
        </div>
        <div>
          <label>鐢婚潰姣斾緥</label>
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
        {busy ? "姝ｅ湪鏋勬€濆叏鐗団€? : "鐢熸垚鍓ф湰涓庡垎闀?}
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
            {project.scenes.length} 涓暅澶?路 {total} 绉?          </span>
          <h2>{project.stage === 2 ? "瀹￠槄鍏ㄧ墖鍒嗛暅" : "瑙嗛鐢熸垚闃熷垪"}</h2>
          <p>{project.summary}</p>
        </div>
        <div className="head-actions">
          {project.stage === 3 && <button className="secondary stop-generation" onClick={cancelGeneration} disabled={cancelRequested || done === project.scenes.length}><CircleAlert />{cancelRequested ? "宸插仠姝? : "鍋滄鐢熸垚"}</button>}
          <button
            className="secondary export"
            onClick={exportVideo}
            disabled={done !== project.scenes.length || busy}
          >
            {busy ? <LoaderCircle className="spin" /> : <Download />}瀵煎嚭鎴愮墖
          </button>
          <button
            className="primary"
            onClick={generateAll}
            disabled={!project.scenes.length || done === project.scenes.length}
          >
            <Play />
            {project.stage === 2
              ? "纭骞剁敓鎴愬叏閮?
              : `缁х画鐢熸垚 ${project.scenes.length - done} 涓暅澶碻}
          </button>
        </div>
      </div>
      {project.stage === 3 && (
        <div className="generation-progress">
          <div>
            <b>鍏ㄧ墖鐢熸垚杩涘害</b>
            <span>
              {done} / {project.scenes.length} 涓暅澶?路 {percent}%
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
        <button className="confirm-script" onClick={onConfirm} disabled={chatBusy || !chat.length}><Check />纭鍓ф湰锛岃嚜鍔ㄥ紑濮嬬敓鎴愯棰?/button>
        </>
      )}
      {project.exportPath && (
        <button
          className="export-result"
          onClick={() => window.vodie?.openPath(project.exportPath!)}
        >
          <FolderOpen />
          鎵撳紑鎴愮墖浣嶇疆 <span>{project.exportPath}</span>
        </button>
      )}
      {project.globalStyle && (
        <div className="style-line">
          <Sparkles />
          <b>鍏ㄥ眬瑙嗚閿氱偣</b>
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
                <img src={s.imageUrl} alt={`${s.title} 鍏抽敭甯} />
              ) : (
                <div className={`placeholder ${s.status}`}>
                  <Clapperboard />
                  {s.status === "generating"
                    ? "瑙嗛涓庨厤闊崇敓鎴愪腑"
                    : s.status === "failed"
                      ? "鐢熸垚澶辫触"
                      : "绛夊緟鐢熸垚"}
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
                    ? "闊崇敾宸插畬鎴?
                    : s.status === "generating"
                      ? "鐢熸垚涓?
                      : s.status === "failed"
                        ? "澶辫触"
                        : "鑽夌"}
                </span>
              </div>
              <label>鏃佺櫧</label>
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
              <label>Grok 瑙嗛鎻愮ず璇?/label>
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
                  鏃堕暱{" "}
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
                  绉?                </label>
                <button
                  className="secondary"
                  onClick={() => generateOne(s)}
                  disabled={s.status === "generating"}
                >
                  <RefreshCw />
                  {s.status === "done" ? "閲嶆柊鐢熸垚" : "鐢熸垚闀滃ご"}
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
                title: "鏂伴暅澶?,
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
        娣诲姞闀滃ご
      </button>
    </section>
  );
}
function ScriptChat({ messages, busy, onSend, onConfirm }: { messages: ChatMessage[]; busy: boolean; onSend: (message: string) => void; onConfirm: () => void }) {
  const [input, setInput] = useState("");
  const submit = () => { const value = input.trim(); if (!value || busy) return; setInput(""); onSend(value); };
  return <div className="script-chat">
    <div className="chat-title"><MessageSquare/><div><b>涓?DeepSeek 瀵兼紨纭鍓ф湰</b><span>鎻愬嚭淇敼锛屾弧鎰忓悗鍐嶇敓鎴愯棰?/span></div></div>
    <div className="chat-messages">{messages.map((message,index)=><div key={index} className={`chat-message ${message.role}`}><span>{message.role==='assistant'?'DeepSeek 瀵兼紨':'浣?}</span><p>{message.content}</p></div>)}{busy&&<div className="chat-message assistant"><span>DeepSeek 瀵兼紨</span><p><LoaderCircle className="spin"/>姝ｅ湪淇敼鍓ф湰鈥?/p></div>}</div>
    <div className="chat-input"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}}} placeholder="渚嬪锛氳淇粰寮傝薄鏇村厠鍒讹紝缁撳熬澧炲姞鍚屽浠殑鍙嶅簲鈥?/><button onClick={submit} disabled={!input.trim()||busy} title="鍙戦€佷慨鏀硅姹?><Send/></button></div>
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
  const [media, setMedia] = useState("妫€娴嬩腑鈥?);
  useEffect(() => {
    window.vodie
      ?.mediaCheck()
      .then((x) =>
        setMedia(
          x.ok ? `FFmpeg 灏辩华 (${x.path})` : `FFmpeg 涓嶅彲鐢細${x.error}`,
        ),
      )
      .catch(() => setMedia("娴忚鍣ㄦā寮忔湭妫€娴?));
  }, []);
  const set = (provider: keyof Settings, key: string, value: string) =>
    setProject({
      ...project,
      settings: {
        ...project.settings,
        [provider]: { ...project.settings[provider], [key]: value },
      },
    });
  const test = async (provider: "deepseek" | "grok") => {
    setStates((s) => ({ ...s, [provider]: "娴嬭瘯涓€? }));
    try {
      await api.test(provider, project.settings);
      setStates((s) => ({ ...s, [provider]: "杩炴帴鎴愬姛" }));
    } catch (e: any) {
      setStates((s) => ({ ...s, [provider]: e.message }));
    }
  };
  return (
    <section>
      <div className="settings-head">
        <span className="eyebrow">渚涘簲鍟嗛厤缃?/span>
        <h1>涓ゆ潯閫氶亾锛屽悇鍙稿叾鑱?/h1>
        <p>
          DeepSeek 璐熻矗缂栧墽銆佽皟搴︿笌鎻愮ず璇嶄紭鍖栵紱Grok 涓撴敞鐢熸垚瑙嗛銆傚嚟鎹敱 Windows 鍔犲瘑淇濆瓨銆?        </p>
      </div>
      <div className="settings-grid">
        <ProviderCard
          name="DeepSeek 瀵兼紨璋冨害"
          note="鍓ф湰 路 鍒嗛暅 路 鎻愮ず璇嶄紭鍖?
          accent="green"
          data={project.settings.deepseek}
          result={states.deepseek}
          onTest={() => test("deepseek")}
          onChange={(k, v) => set("deepseek", k, v)}
        />
        <ProviderCard
          name="Grok 瑙嗛涓浆"
          note="闀滃ご鐢熸垚 路 寮傛浠诲姟杞"
          accent="red"
          data={project.settings.grok}
          result={states.grok}
          onTest={() => test("grok")}
          onChange={(k, v) => set("grok", k, v)}
        />
      </div>
      <div className="protocol">
        <h3>鎺ュ彛绾﹀畾</h3>
        <code>DeepSeek POST /v1/chat/completions</code>
        <code>Local Windows TTS</code>
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
        placeholder="sk-鈥⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€⑩€?
        value={data.apiKey}
        onChange={(e) => onChange("apiKey", e.target.value)}
      />
      <label>妯″瀷鍚嶇О</label>
      <input
        value={data.model}
        onChange={(e) => onChange("model", e.target.value)}
      />
      {extras}
      <div className="card-foot">
        <i className={data.baseUrl && data.apiKey ? "on" : ""} />
        <span>
          {result || (data.baseUrl && data.apiKey ? "閰嶇疆瀹屾暣" : "绛夊緟閰嶇疆")}
        </span>
        <button
          className="secondary test-btn"
          disabled={!data.baseUrl || !data.apiKey}
          onClick={onTest}
        >
          娴嬭瘯杩炴帴
        </button>
      </div>
    </div>
  );
}
