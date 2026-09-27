import { useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { ArrowUpRight, Image, Link2, Upload } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { CanvasCloudAgentPanel } from "@/components/canvas/canvas-cloud-agent-panel";
import { CanvasAgentSkillLibraryModal } from "@/components/canvas/canvas-agent-skill-library-modal";
import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { buildCanvasAgentMentionReferences } from "@/lib/canvas/canvas-resource-references";
import { canvasThemes } from "@/lib/canvas-theme";
import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { ASSET_CATEGORY_LABELS } from "@/lib/asset-category";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { addSkill, listAddedSkills, listSkillLibraryCategories, listSkills, type Skill, type SkillCategory, type SkillLibraryCategory } from "@/services/api/skills";
import { createCanvasProjectWithRemoteSync, hasRemoteUserDataSyncSession, loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { useAssetStore, type Asset, type ImageAsset } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { CategoryTabs } from "./components/CategoryTabs";
import { ExploreTopNav } from "./components/ExploreTopNav";
import { FeaturedSkillCollection } from "./components/FeaturedSkillCollection";
import { FloatingPrompt } from "./components/FloatingPrompt";
import { PromptComposer } from "./components/PromptComposer";
import { MaterialPickerModal } from "./components/MaterialPickerModal";
import { QuickActionChip } from "./components/QuickActionChip";
import { SkillHero } from "./components/SkillHero";
import { SkillSection } from "./components/SkillSection";
import type { SkillReference } from "./components/SkillContextChips";
import type { SkillItem } from "./mock/skills.mock";
import "./skill-explore.css";
import "@/components/canvas/canvas-cloud-agent.css";

const QUICK_ACTIONS = ["电商", "创意", "社交媒体", "品牌", "网站"];

const FALLBACK_IMAGES: Record<string, string> = {
    "AI场景图生成": "/images/skills/aiscene-gen.webp",
    "时尚服装搭配": "/images/skills/fashion-style.jpg",
};

const FALLBACK_VIDEOS: Record<string, string> = {
    "时尚服装搭配": "/images/skills/fashion-style.mp4",
    "境彻品牌系统": "/images/skills/jingche-brand-system.mp4",
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
    const theme = canvasThemes[useActiveTheme()];
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const imageAssets = useMemo(() => assets.filter((asset): asset is ImageAsset => asset.kind === "image"), [assets]);
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
    const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
    const selectedImages = useMemo(() => selectedImageIds.flatMap((id) => imageAssets.find((asset) => asset.id === id) || []), [imageAssets, selectedImageIds]);
    const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
    const [materialOpen, setMaterialOpen] = useState(false);
    const [skillStoreOpen, setSkillStoreOpen] = useState(false);
    const [storeSkills, setStoreSkills] = useState<Skill[]>([]);
    const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
    const [storeCategories, setStoreCategories] = useState<SkillCategory[]>([]);
    const [libraryCategories, setLibraryCategories] = useState<SkillLibraryCategory[]>([]);
    const [storeCategory, setStoreCategory] = useState("all");
    const [storeSearch, setStoreSearch] = useState("");
    const [storePage, setStorePage] = useState(1);
    const [storeHasMore, setStoreHasMore] = useState(false);
    const [storeLoading, setStoreLoading] = useState(false);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [uploadingImages, setUploadingImages] = useState(false);
    const [entryError, setEntryError] = useState("");
    const [readyCanvasId, setReadyCanvasId] = useState("");
    const [readyUserId, setReadyUserId] = useState("");
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [initialSubmission, setInitialSubmission] = useState<{ id: string; prompt: string; skillIds: string[] } | null>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const createLock = useRef(false);
    const created = useRef<{ id: string; userId: string } | null>(null);
    const assetItems = useMemo<AssetLibraryPickerItem[]>(() => assets.filter((asset): asset is Extract<Asset, { kind: "image" | "video" | "audio" }> => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio").map((asset) => ({ id: asset.id, title: asset.title, category: asset.category || "other", archived: asset.status === "archived", kindLabel: asset.kind === "image" ? "图片" : asset.kind === "video" ? "视频" : "音频", mediaKind: asset.kind, asset, searchText: asset.tags.join(" "), disabledReason: asset.kind === "image" ? undefined : "AI 品牌当前只支持图片参考" })), [assets]);

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

    useEffect(() => {
        if (!skillStoreOpen) return;
        let cancelled = false;
        void Promise.all([listAddedSkills(), listSkillLibraryCategories("mine")]).then(([added, categories]) => {
            if (cancelled) return;
            setInstalledSkills(added.skills);
            setLibraryCategories(categories.categories);
        }).catch((cause) => {
            if (!cancelled) message.error(cause instanceof Error ? cause.message : "技能库读取失败");
        });
        return () => { cancelled = true; };
    }, [skillStoreOpen, userId, message]);

    useEffect(() => {
        if (!skillStoreOpen) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            setStoreLoading(true);
            void listSkills({ scope: "public", sort: "popular", pageSize: 20, search: storeSearch.trim() || undefined, tag: storeCategory === "all" ? undefined : storeCategory }).then((result) => {
                if (cancelled) return;
                setStoreSkills(result.skills);
                setStoreCategories(result.categories);
                setStorePage(result.page);
                setStoreHasMore(result.hasMore);
            }).catch((cause) => {
                if (!cancelled) message.error(cause instanceof Error ? cause.message : "技能商店读取失败");
            }).finally(() => { if (!cancelled) setStoreLoading(false); });
        }, storeSearch ? 250 : 0);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [skillStoreOpen, storeCategory, storeSearch, message]);

    const loadMoreStoreSkills = async () => {
        if (storeLoading || !storeHasMore) return;
        setStoreLoading(true);
        try {
            const result = await listSkills({ scope: "public", sort: "popular", pageSize: 20, page: storePage + 1, search: storeSearch.trim() || undefined, tag: storeCategory === "all" ? undefined : storeCategory });
            setStoreSkills((current) => [...current, ...result.skills.filter((skill) => !current.some((item) => item.skillId === skill.skillId))]);
            setStorePage(result.page);
            setStoreHasMore(result.hasMore);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "加载更多技能失败");
        } finally {
            setStoreLoading(false);
        }
    };

    const installStoreSkill = async (skill: Skill) => {
        try {
            const result = await addSkill(skill.skillId);
            setInstalledSkills((current) => [...current.filter((item) => item.skillId !== skill.skillId), result.skill]);
            setStoreSkills((current) => current.map((item) => item.skillId === skill.skillId ? result.skill : item));
            setSelectedSkills((current) => current.some((item) => item.id === skill.skillId) ? current : [...current, { id: skill.skillId, name: result.skill.skillName }]);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "添加技能失败");
        }
    };

    const cards = useMemo(() => skills.map(toCard), [skills]);
    const featured = useMemo(() => cards.slice(0, 4), [cards]);

    const handlePrompt = async () => {
        const text = prompt.trim();
        if (!text || createLock.current || uploadingImages) return;
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
            const project = useCanvasStore.getState().openProject(created.current.id);
            if (!project) throw new Error("创作画布尚未就绪，请重试。");
            const chosenAssets = selectedImageIds.map((id) => useAssetStore.getState().assets.find((asset): asset is ImageAsset => asset.id === id && asset.kind === "image"));
            if (chosenAssets.some((asset) => !asset || asset.status === "archived")) throw new Error("部分参考图片已不可用，请重新选择。");
            const nodes = [...project.nodes];
            const focusIds: string[] = [];
            for (const [index, asset] of chosenAssets.entries()) {
                if (!asset) continue;
                const existing = nodes.find((node) => node.type === CanvasNodeType.Image && node.metadata?.assetId === asset.id);
                if (existing) { focusIds.push(existing.id); continue; }
                const content = asset.data.storageKey ? await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl || asset.coverUrl) : asset.data.dataUrl || asset.coverUrl;
                if (!content) throw new Error(`参考图片「${asset.title}」无法读取`);
                const size = fitNodeSize(asset.data.width || 512, asset.data.height || 512);
                const node: CanvasNodeData = { id: crypto.randomUUID(), type: CanvasNodeType.Image, title: asset.title || "参考图片", position: { x: index * (size.width + 48), y: 0 }, width: size.width, height: size.height, metadata: { content, storageKey: asset.data.storageKey, status: "success", naturalWidth: asset.data.width, naturalHeight: asset.data.height, bytes: asset.data.bytes, mimeType: asset.data.mimeType, assetId: asset.id } };
                nodes.push(node);
                focusIds.push(node.id);
            }
            if (nodes.length !== project.nodes.length) {
                useCanvasStore.getState().updateProject(project.id, { nodes });
                await saveRemoteUserDataNow();
            }
            setSelectedNodeIds(focusIds.slice(0, 8));
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
        composerRef.current?.querySelector<HTMLElement>(".ProseMirror")?.focus({ preventScroll: true });
    };

    const handleRemoveSkill = (id: string) => {
        setSelectedSkills((prev) => prev.filter((skill) => skill.id !== id));
    };

    const selectImages = (ids: string[]) => {
        if (ids.length > 8) { message.warning("单轮最多选择 8 张参考图片"); return; }
        if (ids.some((id) => !imageAssets.some((asset) => asset.id === id && asset.status !== "archived"))) { message.error("部分图片已不在资产库中，请重新选择"); return; }
        setSelectedImageIds(ids);
        setAssetLibraryOpen(false);
        setMaterialOpen(false);
    };

    const uploadLibraryImages = async (files: FileList | File[]) => {
        const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (!selected.length) throw new Error("请选择图片文件");
        const results = await Promise.allSettled(selected.map(async (file) => {
            const uploaded = await uploadImage(file);
            return addAsset({ kind: "image", title: file.name, coverUrl: uploaded.url, tags: ["AI品牌"], status: "confirmed", source: "AI品牌", data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType || "image/png" } });
        }));
        const ids = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
        if (ids.length) message.success(`${ids.length} 张图片已保存到素材库`);
        const failed = results.length - ids.length;
        if (failed) message.error(`${failed} 张图片上传失败`);
        if (!ids.length) throw new Error("图片上传失败，请重试");
        return ids;
    };

    const handleDroppedImages = async (files: File[]) => {
        if (uploadingImages) return;
        const images = files.filter((file) => file.type.startsWith("image/"));
        if (!images.length) { message.warning("请拖入图片文件"); return; }
        const available = 8 - selectedImageIds.length;
        if (available <= 0) { message.warning("单轮最多选择 8 张参考图片"); return; }
        if (images.length > available) message.warning(`本轮还可以添加 ${available} 张参考图片`);
        setUploadingImages(true);
        try {
            const ids = await uploadLibraryImages(images.slice(0, available));
            setSelectedImageIds((current) => [...current, ...ids].slice(0, 8));
            composerRef.current?.querySelector<HTMLElement>(".ProseMirror")?.focus({ preventScroll: true });
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "图片上传失败，请重试");
        } finally {
            setUploadingImages(false);
        }
    };

    return (
        <WorkspacePage fluid scroll className="skill-explore-page-root">
        <div className={canvasId ? "se-page se-chat-page" : "se-page"} onDragOver={(event) => { if (!canvasId && Array.from(event.dataTransfer.types).includes("Files") && !(event.target instanceof Element && event.target.closest(".se-prompt-box"))) { event.preventDefault(); event.dataTransfer.dropEffect = "none"; } }} onDrop={(event) => { if (!canvasId && Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault(); }}>
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
                            selectedNodeIds={selectedNodeIds}
                            open
                            inline
                            clearSkillsAfterSubmit
                            initialSubmission={initialSubmission || undefined}
                            onInitialSubmissionAccepted={() => { setPrompt(""); setSelectedSkills([]); setSelectedImageIds([]); setSelectedNodeIds([]); setInitialSubmission(null); }}
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
                    busy={busy || uploadingImages}
                    selectedSkills={selectedSkills}
                    onRemoveSkill={handleRemoveSkill}
                    composerRef={composerRef}
                    config={config}
                    selectedModel={selectedModel}
                    onModelChange={(model) => { updateConfig("textModel", model); updateConfig("model", model); }}
                    selectedImages={selectedImages}
                    onRemoveImage={(id) => setSelectedImageIds((current) => current.filter((item) => item !== id))}
                    onOpenAssetLibrary={() => setAssetLibraryOpen(true)}
                    onOpenSkills={() => setSkillStoreOpen(true)}
                    onOpenMaterials={() => setMaterialOpen(true)}
                    onImageFilesDrop={(files) => { void handleDroppedImages(files); }}
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
                {featured.length > 0 ? <FeaturedSkillCollection items={featured} onAddToChat={handleAddToChat} onOpenSkills={() => setSkillStoreOpen(true)} /> : null}
                <div className="se-feed">
                    <SkillSection title="AI品牌" items={cards} loading={loading} error={loadError} onAddToChat={handleAddToChat} />
                </div>
            </main>

            <FloatingPrompt message={prompt} onMessageChange={setPrompt} selectedSkills={selectedSkills} onRemoveSkill={handleRemoveSkill} onSend={handlePrompt} busy={busy} />
            </>}
        </div>
        <AssetLibraryPickerModal remoteLibrary open={assetLibraryOpen} items={assetItems} categoryLabels={{ all: "全部素材", ...ASSET_CATEGORY_LABELS }} initialSelectedIds={selectedImageIds} confirmLabel={(count) => `使用已选素材${count ? `（${count}）` : ""}`} upload={{ accept: "image/*", description: "支持图片，上传后保存到素材库", onUpload: uploadLibraryImages }} onClose={() => setAssetLibraryOpen(false)} onConfirm={selectImages} />
        <CanvasAgentSkillLibraryModal open={skillStoreOpen} theme={theme} installedSkills={installedSkills} marketSkills={storeSkills} selectedSkillIds={selectedSkills.map((skill) => skill.id)} categories={storeCategories} libraryCategories={libraryCategories} category={storeCategory} search={storeSearch} loading={storeLoading} hasMore={storeHasMore} onClose={() => setSkillStoreOpen(false)} onCategoryChange={setStoreCategory} onSearch={setStoreSearch} onToggle={(id) => setSelectedSkills((current) => current.some((skill) => skill.id === id) ? current.filter((skill) => skill.id !== id) : [...current, { id, name: installedSkills.find((skill) => skill.skillId === id)?.skillName || storeSkills.find((skill) => skill.skillId === id)?.skillName || id }])} onInstall={installStoreSkill} onLoadMore={loadMoreStoreSkills} />
        <MaterialPickerModal open={materialOpen} assets={imageAssets} selectedIds={selectedImageIds} onClose={() => setMaterialOpen(false)} onConfirm={selectImages} />
        </WorkspacePage>
    );
}
