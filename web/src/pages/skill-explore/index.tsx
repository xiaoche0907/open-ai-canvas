import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { ArrowUpRight, Image, Link2, Upload } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { CanvasCloudAgentPanel } from "@/components/canvas/canvas-cloud-agent-panel";
import { buildCanvasAgentMentionReferences } from "@/lib/canvas/canvas-resource-references";
import { addSkill, listAddedSkills, listSkills, type Skill } from "@/services/api/skills";
import { createCanvasProjectWithRemoteSync, hasRemoteUserDataSyncSession, loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";
import { selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { CategoryTabs } from "./components/CategoryTabs";
import { ExploreTopNav } from "./components/ExploreTopNav";
import { FeaturedSkillCollection } from "./components/FeaturedSkillCollection";
import { FloatingPrompt } from "./components/FloatingPrompt";
import { PromptComposer } from "./components/PromptComposer";
import { QuickActionChip } from "./components/QuickActionChip";
import { SkillHero } from "./components/SkillHero";
import { SkillSection } from "./components/SkillSection";
import type { SkillReference } from "./components/SkillContextChips";
import type { SkillItem } from "./mock/skills.mock";
import "./skill-explore.css";

const QUICK_ACTIONS = ["电商", "创意", "社交媒体", "品牌", "网站"];

const FALLBACK_IMAGES: Record<string, string> = {
    "AI场景图生成": "/images/skills/aiscene-gen.webp",
    "时尚服装搭配": "/images/skills/fashion-style.jpg",
};

const FALLBACK_VIDEOS: Record<string, string> = {
    "时尚服装搭配": "/images/skills/fashion-style.mp4",
};

function toCard(skill: Skill): SkillItem {
    const media = skill.showcaseMedia?.[0];
    return {
        id: skill.skillId,
        title: skill.skillName,
        description: skill.description,
        image: media?.showcaseUrl || media?.showcaseUri || FALLBACK_IMAGES[skill.skillName] || "",
        video: FALLBACK_VIDEOS[skill.skillName],
        author: { name: skill.effectiveUser?.name || "境彻", color: "#F16D9A" },
        users: skill.addedCount,
        likes: skill.likeCount,
        category: "aibrand",
    };
}

export default function SkillExplorePage() {
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const selectedModel = useMemo(() => {
        const models = selectableModelsByCapability(config, "text");
        const preferred = config.textModel || config.model || "";
        return models.includes(preferred) ? preferred : models[0] || "";
    }, [config]);
    const [searchParams, setSearchParams] = useSearchParams();
    const canvasId = searchParams.get("agentCanvas") || "";
    const hydrated = useCanvasStore((state) => state.hydrated);
    const userId = useUserStore((state) => state.user?.id);
    const activeCanvas = useCanvasStore((state) => state.projects.find((project) => project.id === canvasId));
    const agentReferences = useMemo(() => buildCanvasAgentMentionReferences(activeCanvas?.nodes || []), [activeCanvas?.nodes]);
    const [topTab, setTopTab] = useState("skill");
    const [category, setCategory] = useState("AI品牌");
    const [skills, setSkills] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [prompt, setPrompt] = useState("");
    const [selectedSkills, setSelectedSkills] = useState<SkillReference[]>([]);
    const [busy, setBusy] = useState(false);
    const [entryError, setEntryError] = useState("");
    const [readyCanvasId, setReadyCanvasId] = useState("");
    const [readyUserId, setReadyUserId] = useState("");
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [initialSubmission, setInitialSubmission] = useState<{ id: string; prompt: string; skillIds: string[] } | null>(null);
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const createLock = useRef(false);
    const created = useRef<{ id: string; userId: string } | null>(null);

    useEffect(() => {
        if (!canvasId || (readyCanvasId === canvasId && readyUserId === userId) || !hydrated || !userId) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const load = () => {
            if (!hasRemoteUserDataSyncSession()) {
                timer = setTimeout(load, 300);
                return;
            }
            void loadCanvasProjectForEditing(canvasId)
                .then(() => { if (!cancelled && useUserStore.getState().user?.id === userId) { setReadyCanvasId(canvasId); setReadyUserId(userId); setEntryError(""); } })
                .catch((cause) => { if (!cancelled) setEntryError(cause instanceof Error ? cause.message : "Agent 会话加载失败"); });
        };
        load();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [canvasId, hydrated, readyCanvasId, readyUserId, userId, loadAttempt]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError("");
        listSkills({ scope: "public", tag: "aibrand", sort: "popular", pageSize: 20 })
            .then((result) => {
                if (cancelled) return;
                setSkills(result.skills);
            })
            .catch((error) => {
                if (cancelled) return;
                setSkills([]);
                setLoadError(error instanceof Error ? error.message : "AI品牌 技能加载失败");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const cards = useMemo(() => skills.map(toCard), [skills]);
    const featured = useMemo(() => cards.slice(0, 4), [cards]);

    const handlePrompt = async () => {
        const text = prompt.trim();
        if (!text || createLock.current) return;
        createLock.current = true;
        setBusy(true);
        setEntryError("");
        try {
            if (!userId || !hydrated || !hasRemoteUserDataSyncSession()) throw new Error("登录或画布同步尚未就绪，请稍后重试。");
            const installed = await listAddedSkills();
            for (const skill of selectedSkills) {
                if (!installed.skills.some((item) => item.skillId === skill.id)) await addSkill(skill.id);
            }
            if (useUserStore.getState().user?.id !== userId) return;
            if (created.current?.userId !== userId) created.current = null;
            if (!created.current) {
                const result = await createCanvasProjectWithRemoteSync("AI 品牌创作");
                if (!result.id) throw new Error("画布创建未返回有效 ID，请重试。");
                created.current = { id: result.id, userId };
                if (result.syncError) throw new Error("画布已缓存在本机，但云端尚未保存。请重试同步后再启动 Agent。");
            } else {
                await saveRemoteUserDataNow();
            }
            await loadCanvasProjectForEditing(created.current.id);
            if (useUserStore.getState().user?.id !== userId) return;
            setInitialSubmission({ id: crypto.randomUUID(), prompt: text, skillIds: selectedSkills.map((skill) => skill.id) });
            setReadyCanvasId(created.current.id);
            setReadyUserId(userId);
            setSearchParams({ agentCanvas: created.current.id });
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : "启动 Agent 失败，请重试。";
            setEntryError(detail);
            message.error(detail);
        } finally {
            createLock.current = false;
            setBusy(false);
        }
    };

    const handleAddToChat = (item: SkillItem) => {
        setSelectedSkills((prev) => (prev.some((skill) => skill.id === item.id) ? prev : [...prev, { id: item.id, name: item.title }]));
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        composerRef.current?.focus({ preventScroll: true });
    };

    const handleRemoveSkill = (id: string) => {
        setSelectedSkills((prev) => prev.filter((skill) => skill.id !== id));
    };

    return (
        <WorkspacePage fluid scroll className="skill-explore-page-root">
        <div className={canvasId ? "se-page se-chat-page" : "se-page"}>
            {canvasId ? (
                <div className="se-agent-workspace">
                    <div className="se-agent-workspace-header">
                        <button type="button" onClick={() => { created.current = null; setInitialSubmission(null); setSearchParams({}); }}>AI 品牌 <span aria-hidden="true">/</span> 返回技能广场</button>
                        <Link to={`/canvas/${encodeURIComponent(canvasId)}?agent=1`}>查看创作画布 <ArrowUpRight size={14} aria-hidden="true" /></Link>
                    </div>
                    {entryError ? <div className="se-agent-error" role="alert">{entryError} {readyCanvasId !== canvasId || readyUserId !== userId ? <button type="button" onClick={() => { setEntryError(""); setLoadAttempt((value) => value + 1); }}>重试加载</button> : null}</div> : null}
                    {readyCanvasId === canvasId && readyUserId === userId ? (
                        <CanvasCloudAgentPanel
                            key={`${userId}:${canvasId}`}
                            canvasId={canvasId}
                            nodeCount={activeCanvas?.nodes.length || 0}
                            references={agentReferences}
                            open
                            inline
                            clearSkillsAfterSubmit
                            initialSubmission={initialSubmission || undefined}
                            onInitialSubmissionAccepted={() => { setPrompt(""); setSelectedSkills([]); setInitialSubmission(null); }}
                            onOpen={() => undefined}
                            onCollapse={() => { created.current = null; setSearchParams({}); }}
                        />
                    ) : <div className="se-agent-loading" role="status">正在恢复 Agent 会话…</div>}
                </div>
            ) : <>
            <div className="se-hero">
                <SkillHero />
                <PromptComposer
                    message={prompt}
                    onMessageChange={setPrompt}
                    onSend={handlePrompt}
                    busy={busy}
                    selectedSkills={selectedSkills}
                    onRemoveSkill={handleRemoveSkill}
                    textareaRef={composerRef}
                    config={config}
                    selectedModel={selectedModel}
                    onModelChange={(model) => { updateConfig("textModel", model); updateConfig("model", model); }}
                />
                {entryError ? <p className="se-agent-error" role="alert">{entryError}</p> : null}
                <div className="se-quick-row">
                    <span className="se-quick-label">境彻 帮你做：</span>
                    {QUICK_ACTIONS.map((action) => (
                        <QuickActionChip key={action} label={action} icon={Image} onClick={() => message.info(`「${action}」方向即将开放`)} />
                    ))}
                </div>
                <div className="se-quick-row">
                    <span className="se-quick-label">连接 / 收集灵感：</span>
                    <QuickActionChip label="使用我的 Pinterest 参考图" icon={Link2} onClick={() => message.info("Pinterest 连接开发中")} />
                    <QuickActionChip label="安装 境彻 Clipper — 一键收藏网页灵感图" icon={Upload} onClick={() => message.info("Clipper 安装引导开发中")} />
                </div>
            </div>

            <main className="se-main">
                <ExploreTopNav active={topTab} onChange={(key) => { setTopTab(key); if (key !== "skill") message.info("该模块开发中，敬请期待"); }} />
                <CategoryTabs active={category} onChange={setCategory} />
                {featured.length > 0 ? <FeaturedSkillCollection items={featured} onAddToChat={handleAddToChat} /> : null}
                <div className="se-feed">
                    <SkillSection title="AI品牌" items={cards} loading={loading} error={loadError} onAddToChat={handleAddToChat} />
                </div>
            </main>

            <FloatingPrompt message={prompt} onMessageChange={setPrompt} selectedSkills={selectedSkills} onRemoveSkill={handleRemoveSkill} onSend={handlePrompt} busy={busy} />
            </>}
        </div>
        </WorkspacePage>
    );
}
