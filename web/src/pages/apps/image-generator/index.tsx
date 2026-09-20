import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { message } from "antd";
import { nanoid } from "nanoid";
import { Sparkles, ArrowLeft } from "lucide-react";

import { modelOptionName, resolveModelChannel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { uploadImage } from "@/services/image-storage";
import { runBackendGenerationTask, runBackendGenerationTaskBatch } from "@/services/api/generation-task";
import { creationCanvasHandoffPath } from "@/lib/canvas/canvas-asset-handoff";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import { defaultImageCapabilityConfig, modelCapabilityConfigFor, normalizeImageValue } from "@/lib/model-capabilities";
import { modelQuoteRequest, requestCreditCost } from "@/lib/model-pricing";
import type { ModelRequirements } from "@/lib/model-selection";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { CanvasCloudAgentPanel } from "@/components/canvas/canvas-cloud-agent-panel";
import { buildCanvasAgentMentionReferences } from "@/lib/canvas/canvas-resource-references";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { CanvasNodeType } from "@/types/canvas";
import { createCanvasProjectWithRemoteSync, hasRemoteUserDataSyncSession, loadCanvasProjectForEditing, saveRemoteUserDataNow } from "@/services/user-data-sync";

import { FloatingGenerationDock } from "./floating-generation-dock";
import { InspirationSection } from "./inspiration-section";
import { CanvasWorkspaceView } from "./canvas-workspace-view";
import { ImageGenProjectSidebar } from "./project-sidebar";

import type {
    GeneratorViewMode,
    ImageGenParams,
    UploadedReferenceImage,
    GeneratedImageItem,
    ImageGenHistoryRecord,
    ImageGenProject,
} from "./types";
import { MAX_REFERENCE_IMAGES } from "./types";

import "@/pages/create/creation-product.css";
import "./image-generator.css";

const HISTORY_STORAGE_KEY = "infinite-canvas:apps:image-gen-history";
const PROJECTS_STORAGE_KEY = "infinite-canvas:apps:image-gen-projects-v1";

function createAgentReferenceNode(reference: UploadedReferenceImage, index: number) {
    const node = createCanvasNode(CanvasNodeType.Image, { x: 260 + index * 340, y: 240 }, {
        content: reference.url,
        previewContent: reference.url,
        storageKey: reference.storageKey,
        mimeType: reference.mimeType || "image/png",
        bytes: reference.bytes,
        naturalWidth: reference.width,
        naturalHeight: reference.height,
        assetId: reference.assetId,
        status: "success",
        pluginData: { imageGeneratorRole: "reference", imageGeneratorReferenceId: reference.id },
    });
    return { ...node, title: `参考图 · ${reference.name}` };
}

interface ImageGeneratorProps {
    onBack: () => void;
}

export function ImageGeneratorWorkspace({ onBack }: ImageGeneratorProps) {
    const navigate = useNavigate();

    // 全局配置与模型
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const addAsset = useAssetStore((state) => state.addAsset);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);

    // 当前视图模式（发现态 vs 工作台态）
    const [viewMode, setViewMode] = useState<GeneratorViewMode>("discovery");

    // 创作输入状态
    const [taskTitle, setTaskTitle] = useState("商业视觉创作");
    const [prompt, setPrompt] = useState("");
    const [referenceImages, setReferenceImages] = useState<UploadedReferenceImage[]>([]);
    const [uploadingRef, setUploadingRef] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>(() => {
        return config.imageModel || "gpt-image-1";
    });

    useEffect(() => {
        if (config.imageModel && (!selectedModel || selectedModel === "gpt-image-1")) {
            setSelectedModel(config.imageModel);
        }
    }, [config.imageModel]);

    const [params, setParams] = useState<ImageGenParams>({
        ratio: "1:1",
        quality: "auto",
        format: "png",
        count: "1",
    });

    const pricing = useMemo(() => {
        const imageProfile = modelCapabilityConfigFor(config, selectedModel || config.imageModel)?.image || defaultImageCapabilityConfig(undefined, selectedModel);
        const normalized = normalizeImageValue(imageProfile, {
            size: params.ratio,
            quality: params.quality,
            count: params.count,
        });
        const count = Math.max(1, Math.min(imageProfile.maxOutputs, Math.floor(Number(normalized.count || params.count) || 1)));
        const pricingConfig = {
            ...effectiveConfig,
            model: selectedModel,
            imageModel: selectedModel,
            size: normalized.size || params.ratio,
            quality: normalized.quality || params.quality,
            count: String(count),
        };
        const requirements: ModelRequirements = {
            capability: "image",
            input: {
                textCount: 1,
                imageCount: referenceImages.length,
                videoCount: 0,
                audioCount: 0,
                characterCount: 0,
            },
            imageSize: pricingConfig.size,
            options: {
                size: pricingConfig.size,
                quality: pricingConfig.quality,
                count,
            },
        };
        const channel = resolveModelChannel(pricingConfig, selectedModel);
        const configuredCredits = requestCreditCost({
            channelMode: channel.scope === "system" ? "remote" : "local",
            modelCosts: channel.modelCosts,
            model: modelOptionName(selectedModel),
            count,
            capability: "image",
            config: pricingConfig,
            requirements,
        });
        return {
            configuredCredits,
            quoteRequest: modelQuoteRequest(pricingConfig, selectedModel, "image", requirements),
        };
    }, [config, effectiveConfig, params, referenceImages.length, selectedModel]);
    const quoteRequestKey = JSON.stringify(pricing.quoteRequest || null);
    const [routeQuote, setRouteQuote] = useState<{ key: string; quote: LogicalModelQuote } | null>(null);

    useEffect(() => {
        if (!creditsEnabled || !pricing.quoteRequest) {
            setRouteQuote(null);
            return;
        }
        const controller = new AbortController();
        setRouteQuote(null);
        quoteModel(pricing.quoteRequest, controller.signal)
            .then(({ quote }) => setRouteQuote({ key: quoteRequestKey, quote }))
            .catch(() => {
                if (!controller.signal.aborted) setRouteQuote(null);
            });
        return () => controller.abort();
        // quoteRequestKey captures the normalized request without retriggering on object identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [creditsEnabled, quoteRequestKey]);

    const currentRouteQuote = routeQuote?.key === quoteRequestKey ? routeQuote.quote : null;
    const creditCost = creditsEnabled
        ? (currentRouteQuote ? currentRouteQuote.amountMicrocredits / 1_000_000 : pricing.configuredCredits)?.toLocaleString("zh-CN", { maximumFractionDigits: 6 })
        : undefined;

    // 生成执行与结果
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStage, setGenerationStage] = useState("正在构思商业视觉画面并提交渲染...");
    const [currentResults, setCurrentResults] = useState<GeneratedImageItem[]>([]);
    const currentResultsRef = useRef<GeneratedImageItem[]>([]);

    const [projects, setProjects] = useState<ImageGenProject[]>([]);
    const [activeProjectId, setActiveProjectId] = useState("");
    const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false);
    const [generationMode, setGenerationMode] = useState<"image" | "agent">("image");
    const [agentOpen, setAgentOpen] = useState(false);
    const [agentPreparing, setAgentPreparing] = useState(false);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const activeImageProject = useMemo(() => projects.find((project) => project.id === activeProjectId), [activeProjectId, projects]);
    const agentCanvasId = activeImageProject?.canvasId || "";
    const agentCanvasProject = useMemo(() => canvasProjects.find((project) => project.id === agentCanvasId), [agentCanvasId, canvasProjects]);
    const agentMentionReferences = useMemo(() => buildCanvasAgentMentionReferences(agentCanvasProject?.nodes || []), [agentCanvasProject?.nodes]);

    useEffect(() => {
        currentResultsRef.current = currentResults;
    }, [currentResults]);

    const persistProjects = useCallback(async (nextProjects: ImageGenProject[]) => {
        try {
            const storage = localForageStorageForScope(getActiveUserScope());
            await storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(nextProjects));
        } catch (err) {
            console.warn("[ImageGenerator] Failed to persist projects:", err);
        }
    }, []);

    // 加载项目；首次升级时把旧生成历史迁移为项目。
    useEffect(() => {
        let mounted = true;
        const loadProjects = async () => {
            try {
                const storage = localForageStorageForScope(getActiveUserScope());
                const rawProjects = await storage.getItem(PROJECTS_STORAGE_KEY);
                if (rawProjects) {
                    const parsed = JSON.parse(String(rawProjects)) as ImageGenProject[];
                    if (Array.isArray(parsed) && mounted) setProjects(parsed);
                    return;
                }

                const rawHistory = await storage.getItem(HISTORY_STORAGE_KEY);
                if (rawHistory && mounted) {
                    const records = JSON.parse(String(rawHistory)) as ImageGenHistoryRecord[];
                    if (!Array.isArray(records)) return;
                    const migrated = records.map((record) => ({
                        ...record,
                        pinned: false,
                        updatedAt: record.createdAt,
                    } satisfies ImageGenProject));
                    setProjects(migrated);
                    await storage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(migrated));
                }
            } catch (err) {
                console.warn("[ImageGenerator] Failed to load projects:", err);
            }
        };
        void loadProjects();
        return () => {
            mounted = false;
        };
    }, []);

    const loadProject = useCallback((project: ImageGenProject) => {
        setGenerationMode("image");
        setAgentOpen(false);
        setActiveProjectId(project.id);
        setTaskTitle(project.title);
        setPrompt(project.prompt);
        setSelectedModel(project.model || config.imageModel || "gpt-image-1");
        setParams(project.params);
        setReferenceImages(project.references || []);
        setCurrentResults(project.results || []);
        setViewMode("workspace");
    }, [config.imageModel]);

    const handleCreateProject = useCallback(() => {
        setGenerationMode("image");
        setAgentOpen(false);
        const now = new Date().toISOString();
        const project: ImageGenProject = {
            id: nanoid(),
            title: "未命名项目",
            prompt: "",
            model: selectedModel,
            params: { ...params },
            references: [],
            results: [],
            pinned: false,
            createdAt: now,
            updatedAt: now,
        };
        setProjects((current) => {
            const next = [project, ...current];
            void persistProjects(next);
            return next;
        });
        setActiveProjectId(project.id);
        setTaskTitle(project.title);
        setPrompt("");
        setReferenceImages([]);
        setCurrentResults([]);
        setViewMode("workspace");
    }, [params, persistProjects, selectedModel]);

    const handleRenameProject = useCallback((id: string, title: string) => {
        setProjects((current) => {
            const next = current.map((project) => project.id === id ? { ...project, title, updatedAt: new Date().toISOString() } : project);
            void persistProjects(next);
            return next;
        });
        if (id === activeProjectId) setTaskTitle(title);
    }, [activeProjectId, persistProjects]);

    const handleTogglePinProject = useCallback((id: string) => {
        setProjects((current) => {
            const next = current.map((project) => project.id === id ? { ...project, pinned: !project.pinned } : project);
            void persistProjects(next);
            return next;
        });
    }, [persistProjects]);

    const handleDeleteProject = useCallback((id: string) => {
        setProjects((current) => {
            const next = current.filter((project) => project.id !== id);
            void persistProjects(next);
            if (id === activeProjectId) {
                const replacement = [...next].sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
                if (replacement) loadProject(replacement);
                else {
                    setGenerationMode("image");
                    setAgentOpen(false);
                    setActiveProjectId("");
                    setTaskTitle("未命名项目");
                    setPrompt("");
                    setReferenceImages([]);
                    setCurrentResults([]);
                }
            }
            return next;
        });
        message.success("项目已删除，资产库中的图片仍然保留");
    }, [activeProjectId, loadProject, persistProjects]);

    const handleChangeProjectTitle = useCallback((title: string) => {
        setTaskTitle(title);
        if (!activeProjectId) return;
        setProjects((current) => {
            const next = current.map((project) => project.id === activeProjectId ? { ...project, title } : project);
            void persistProjects(next);
            return next;
        });
    }, [activeProjectId, persistProjects]);

    const persistAgentCanvasId = useCallback((projectId: string, canvasId: string) => {
        setProjects((current) => {
            const next = current.map((project) => project.id === projectId
                ? { ...project, canvasId, updatedAt: new Date().toISOString() }
                : project);
            void persistProjects(next);
            return next;
        });
    }, [persistProjects]);

    const syncReferencesToAgentCanvas = useCallback(async (canvasId: string) => {
        const store = useCanvasStore.getState();
        const canvas = store.openProject(canvasId);
        if (!canvas) throw new Error("Agent 工作画布尚未加载，请重试");
        const existingReferenceIds = new Set(canvas.nodes.flatMap((node) => {
            const value = node.metadata?.pluginData?.imageGeneratorReferenceId;
            return typeof value === "string" ? [value] : [];
        }));
        const missingReferences = referenceImages.filter((reference) => !existingReferenceIds.has(reference.id));
        if (missingReferences.length) {
            const nodes = [
                ...canvas.nodes,
                ...missingReferences.map((reference, index) => createAgentReferenceNode(reference, existingReferenceIds.size + index)),
            ];
            store.updateProject(canvasId, { nodes });
        }
        await saveRemoteUserDataNow(canvasId);
    }, [referenceImages]);

    const enterAgentMode = useCallback(async () => {
        if (agentPreparing) return;
        if (!canvasHydrated) {
            message.warning("画布数据仍在加载，请稍后再进入 Agent");
            return;
        }
        if (!hasRemoteUserDataSyncSession()) {
            message.warning("请先登录并等待云端同步就绪，再使用 Agent");
            return;
        }

        setAgentPreparing(true);
        try {
            const now = new Date().toISOString();
            let imageProject = projects.find((project) => project.id === activeProjectId);
            if (!imageProject) {
                imageProject = {
                    id: nanoid(),
                    title: taskTitle || "未命名项目",
                    prompt,
                    model: selectedModel,
                    params: { ...params },
                    references: [...referenceImages],
                    results: [...currentResultsRef.current],
                    pinned: false,
                    createdAt: now,
                    updatedAt: now,
                };
                const createdProject = imageProject;
                setProjects((current) => {
                    const next = [createdProject, ...current];
                    void persistProjects(next);
                    return next;
                });
                setActiveProjectId(createdProject.id);
            }

            let canvasId = imageProject.canvasId || "";
            if (canvasId) {
                await loadCanvasProjectForEditing(canvasId);
            } else {
                const initialNodes = referenceImages.map(createAgentReferenceNode);
                const created = await createCanvasProjectWithRemoteSync(`图像 Agent · ${imageProject.title}`, undefined, {
                    nodes: initialNodes,
                    connections: [],
                });
                canvasId = created.id;
                persistAgentCanvasId(imageProject.id, canvasId);
                if (created.syncError) throw new Error("Agent 工作画布已保存在本机，但云端同步失败，请重试");
            }

            await syncReferencesToAgentCanvas(canvasId);
            setViewMode("workspace");
            setGenerationMode("agent");
            setAgentOpen(true);
        } catch (cause) {
            message.error(cause instanceof Error ? cause.message : "Agent 启动失败，请重试");
        } finally {
            setAgentPreparing(false);
        }
    }, [activeProjectId, agentPreparing, canvasHydrated, params, persistAgentCanvasId, persistProjects, projects, prompt, referenceImages, selectedModel, syncReferencesToAgentCanvas, taskTitle]);

    const handleChangeGenerationMode = useCallback((mode: "image" | "agent") => {
        if (mode === "image") {
            setGenerationMode("image");
            setAgentOpen(false);
            return;
        }
        void enterAgentMode();
    }, [enterAgentMode]);

    useEffect(() => {
        if (!agentCanvasProject || !activeProjectId) return;
        const agentResults = agentCanvasProject.nodes.flatMap((node): GeneratedImageItem[] => {
            const metadata = node.metadata;
            if (node.type !== CanvasNodeType.Image || metadata?.status !== "success" || !metadata.content) return [];
            if (metadata.pluginData?.imageGeneratorRole === "reference") return [];
            return [{
                id: `canvas-agent:${node.id}`,
                url: metadata.content,
                storageKey: metadata.storageKey,
                width: metadata.naturalWidth || node.width,
                height: metadata.naturalHeight || node.height,
                bytes: metadata.bytes,
                mimeType: metadata.mimeType || "image/png",
                prompt: metadata.prompt || node.title,
                model: metadata.model,
                assetId: metadata.assetId,
                createdAt: node.createdAt || node.updatedAt || new Date().toISOString(),
            }];
        });
        const retained = currentResultsRef.current.filter((item) => !item.id.startsWith("canvas-agent:"));
        const retainedUrls = new Set(retained.map((item) => item.url));
        const nextResults = [...retained, ...agentResults.filter((item) => !retainedUrls.has(item.url))];
        const previousSignature = currentResultsRef.current.map((item) => `${item.id}:${item.url}`).join("|");
        const nextSignature = nextResults.map((item) => `${item.id}:${item.url}`).join("|");
        if (previousSignature === nextSignature) return;

        currentResultsRef.current = nextResults;
        setCurrentResults(nextResults);
        setProjects((current) => {
            const next = current.map((project) => project.id === activeProjectId
                ? { ...project, results: nextResults, updatedAt: new Date().toISOString() }
                : project);
            void persistProjects(next);
            return next;
        });
    }, [activeProjectId, agentCanvasProject, persistProjects]);

    // 1. 上传参考图并同步到「我的资产」
    const handleUploadReference = async (files: File[]) => {
        const imageFiles = files.filter((file) => file.type.startsWith("image/"));
        const remaining = MAX_REFERENCE_IMAGES - referenceImages.length;
        if (remaining <= 0) {
            message.warning(`最多只能上传 ${MAX_REFERENCE_IMAGES} 张参考图`);
            return;
        }

        const selectedFiles = imageFiles.slice(0, remaining);
        if (!selectedFiles.length) {
            message.warning("请选择图片文件");
            return;
        }
        if (imageFiles.length > remaining) {
            message.info(`本次只添加前 ${remaining} 张，参考图总数最多为 ${MAX_REFERENCE_IMAGES} 张`);
        }

        setUploadingRef(true);
        try {
            const settled = await Promise.allSettled(selectedFiles.map(async (file) => {
                const uploaded = await uploadImage(file);
                const assetId = addAsset({
                    kind: "image",
                    title: `参考图: ${file.name.slice(0, 30)}`,
                    coverUrl: uploaded.url,
                    category: "material",
                    tags: ["AI应用", "参考图"],
                    data: {
                        dataUrl: uploaded.url,
                        storageKey: uploaded.storageKey,
                        width: uploaded.width || 1024,
                        height: uploaded.height || 1024,
                        bytes: uploaded.bytes || file.size,
                        mimeType: uploaded.mimeType || file.type,
                    },
                });

                return {
                    reference: {
                        id: nanoid(),
                        url: uploaded.url,
                        storageKey: uploaded.storageKey,
                        name: file.name,
                        width: uploaded.width,
                        height: uploaded.height,
                        bytes: uploaded.bytes,
                        mimeType: uploaded.mimeType,
                        assetId,
                    } satisfies UploadedReferenceImage,
                    pendingRemoteUpload: uploaded.pendingRemoteUpload,
                };
            }));

            const uploaded = settled.flatMap((entry) => entry.status === "fulfilled" ? [entry.value] : []);
            const failedCount = settled.length - uploaded.length;
            const pendingCount = uploaded.filter((entry) => entry.pendingRemoteUpload).length;

            if (uploaded.length) {
                setReferenceImages((current) => [...current, ...uploaded.map((entry) => entry.reference)].slice(0, MAX_REFERENCE_IMAGES));
            }

            if (!uploaded.length) {
                const firstFailure = settled.find((entry) => entry.status === "rejected");
                message.error(firstFailure?.status === "rejected" && firstFailure.reason instanceof Error ? firstFailure.reason.message : "参考图上传失败");
            } else if (failedCount) {
                message.warning(`${uploaded.length} 张参考图已加入「我的资产」，${failedCount} 张上传失败`);
            } else if (pendingCount) {
                message.warning(`${uploaded.length} 张参考图已加入「我的资产」，其中 ${pendingCount} 张暂存本机并等待服务端同步`);
            } else {
                message.success(`${uploaded.length} 张参考图已上传，并全部加入「我的资产」`);
            }
        } finally {
            setUploadingRef(false);
        }
    };

    // 2. 移除参考图
    const handleRemoveReference = (id: string) => {
        setReferenceImages((list) => list.filter((item) => item.id !== id));
    };

    // 3. 执行图像生成
    const handleGenerate = async () => {
        const trimmed = prompt.trim();
        if (!trimmed) {
            message.warning("请输入提示词");
            return;
        }

        const now = new Date().toISOString();
        const generationProjectId = activeProjectId || nanoid();
        if (!activeProjectId) {
            const project: ImageGenProject = {
                id: generationProjectId,
                title: taskTitle || trimmed.slice(0, 24),
                prompt: trimmed,
                model: selectedModel,
                params: { ...params },
                references: [...referenceImages],
                results: [],
                pinned: false,
                createdAt: now,
                updatedAt: now,
            };
            setActiveProjectId(generationProjectId);
            setProjects((current) => {
                const next = [project, ...current];
                void persistProjects(next);
                return next;
            });
        }

        // 切换到工作台视图展示画布过程
        setViewMode("workspace");
        setIsGenerating(true);
        setGenerationStage("正在构图并准备向模型发起生成请求...");

        try {
            const imageProfile = modelCapabilityConfigFor(config, selectedModel || config.imageModel)?.image || defaultImageCapabilityConfig(undefined, selectedModel);
            const normalizedImage = normalizeImageValue(imageProfile, {
                size: params.ratio,
                quality: params.quality,
                count: String(params.count),
            });

            const taskCount = Math.max(1, Math.min(imageProfile.maxOutputs, Math.floor(Number(params.count) || 1)));

            const requestConfig = {
                ...effectiveConfig,
                model: selectedModel,
                imageModel: selectedModel,
                size: normalizedImage.size || params.ratio,
                quality: normalizedImage.quality || params.quality,
                count: normalizedImage.count || String(params.count),
            };

            const refPayload = referenceImages.map((ref) => ({
                id: ref.id,
                name: ref.name,
                type: ref.mimeType || "image/png",
                dataUrl: ref.url,
                url: ref.url,
                storageKey: ref.storageKey,
                width: ref.width,
                height: ref.height,
                bytes: ref.bytes,
            }));

            let rawImages: Array<{ dataUrl: string; storageKey?: string; width?: number; height?: number; bytes?: number; mimeType?: string }> = [];

            if (taskCount > 1) {
                const settled = await runBackendGenerationTaskBatch({
                    mode: "image",
                    prompt: trimmed,
                    config: { ...requestConfig, count: "1" },
                    referenceImages: refPayload,
                    count: taskCount,
                    metadata: {
                        source: "ai-apps-image-gen",
                        ratio: params.ratio,
                        quality: params.quality,
                        format: params.format,
                    },
                    onTaskUpdate: (task) => {
                        if (task.status === "running") {
                            setGenerationStage("模型正在批量渲染高质感画面...");
                        }
                    },
                });
                rawImages = settled.flatMap((entry) => (entry.status === "fulfilled" && entry.value.images ? entry.value.images : []));
                if (!rawImages.length) {
                    const fail = settled.find((e) => e.status === "rejected");
                    throw (fail && "reason" in fail && fail.reason instanceof Error) ? fail.reason : new Error("模型未返回有效图片结果");
                }
            } else {
                const result = await runBackendGenerationTask({
                    mode: "image",
                    prompt: trimmed,
                    config: requestConfig,
                    referenceImages: refPayload,
                    metadata: {
                        source: "ai-apps-image-gen",
                        ratio: params.ratio,
                        quality: params.quality,
                        format: params.format,
                    },
                    onTaskUpdate: (task) => {
                        if (task.status === "running") {
                            setGenerationStage("模型正在深度渲染高质感画面...");
                        }
                    },
                });
                rawImages = result.images || [];
                if (!rawImages.length) {
                    throw new Error("模型未返回有效图片结果");
                }
            }

            // 保存到资产库并构造成结果项
            const newItems: GeneratedImageItem[] = rawImages.map((img) => {
                const assetId = addAsset({
                    kind: "image",
                    title: (taskTitle || trimmed).slice(0, 30),
                    coverUrl: img.dataUrl,
                    category: "material",
                    tags: ["AI应用", "图像生成"],
                    data: {
                        dataUrl: img.dataUrl,
                        storageKey: img.storageKey,
                        width: img.width || 1024,
                        height: img.height || 1024,
                        bytes: img.bytes || 0,
                        mimeType: img.mimeType || "image/png",
                    },
                });

                return {
                    id: nanoid(),
                    url: img.dataUrl,
                    storageKey: img.storageKey,
                    width: img.width || 1024,
                    height: img.height || 1024,
                    bytes: img.bytes || 0,
                    mimeType: img.mimeType || "image/png",
                    prompt: trimmed,
                    model: selectedModel,
                    assetId,
                    createdAt: new Date().toISOString(),
                };
            });

            const nextResults = [...currentResults, ...newItems];
            setCurrentResults(nextResults);
            setProjects((current) => {
                const updatedAt = new Date().toISOString();
                const exists = current.some((project) => project.id === generationProjectId);
                const update: ImageGenProject = {
                    id: generationProjectId,
                    canvasId: current.find((project) => project.id === generationProjectId)?.canvasId,
                    title: taskTitle || trimmed.slice(0, 24),
                    prompt: trimmed,
                    model: selectedModel,
                    params: { ...params },
                    references: [...referenceImages],
                    results: nextResults,
                    pinned: current.find((project) => project.id === generationProjectId)?.pinned || false,
                    createdAt: current.find((project) => project.id === generationProjectId)?.createdAt || updatedAt,
                    updatedAt,
                };
                const next = exists
                    ? current.map((project) => project.id === generationProjectId ? update : project)
                    : [update, ...current];
                void persistProjects(next);
                return next;
            });
            message.success(`已生成 ${newItems.length} 张图片，并全部入库「我的资产」`);
        } catch (err) {
            console.error("[ImageGenerator] Generation error:", err);
            message.error(err instanceof Error ? err.message : "图片生成失败，请重试");
        } finally {
            setIsGenerating(false);
        }
    };

    // 4. 发送到主画布（使用系统推荐无损机制）
    const handleSendToCanvas = (item: GeneratedImageItem) => {
        if (!item.assetId) {
            message.warning("未找到该素材的资产记录");
            return;
        }
        const handoffUrl = creationCanvasHandoffPath([item.assetId]);
        if (handoffUrl) {
            navigate(handoffUrl);
        } else {
            navigate("/canvas");
        }
    };

    // 底部浮动控制坞组件
    const dockElement = (
        <FloatingGenerationDock
            config={config}
            prompt={prompt}
            onChangePrompt={setPrompt}
            referenceImages={referenceImages}
            onUploadReference={handleUploadReference}
            onRemoveReference={handleRemoveReference}
            uploadingRef={uploadingRef}
            params={params}
            onChangeParams={(patch) => setParams((p) => ({ ...p, ...patch }))}
            selectedModel={selectedModel}
            onChangeModel={setSelectedModel}
            creditCost={creditCost}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            isWorkspace={viewMode === "workspace"}
            mode={generationMode}
            agentPreparing={agentPreparing}
            onChangeMode={handleChangeGenerationMode}
        />
    );

    return (
        <div className={`image-gen-root ${viewMode === "discovery" ? "is-discovery" : "is-workspace"}`}>
            {viewMode === "discovery" ? (
                <>
                    <ImageGenProjectSidebar
                        projects={projects}
                        activeProjectId={activeProjectId}
                        collapsed={projectSidebarCollapsed}
                        onChangeCollapsed={setProjectSidebarCollapsed}
                        onOpenCreation={() => {
                            setGenerationMode("image");
                            setAgentOpen(false);
                            setViewMode("discovery");
                        }}
                        onCreateProject={handleCreateProject}
                        onSelectProject={loadProject}
                        onRenameProject={handleRenameProject}
                        onDeleteProject={handleDeleteProject}
                        onTogglePinProject={handleTogglePinProject}
                    />
                    <div className="image-gen-discovery-main">
                    <div className="image-gen-discovery-container">
                    {/* 顶部面包屑与标题 */}
                    <div style={{ alignSelf: "flex-start", marginBottom: 20 }}>
                        <button
                            type="button"
                            className="image-gen-back-btn"
                            onClick={onBack}
                        >
                            <ArrowLeft className="size-4" />
                            <span>返回 AI应用</span>
                        </button>
                    </div>

                    {/* Hero 区域 */}
                    <div className="image-gen-hero-header">
                        <h1 className="image-gen-hero-title">
                            <Sparkles className="size-7" />
                            <span>AI 图像生成 · 商业视觉工作室</span>
                        </h1>
                        <p className="image-gen-hero-subtitle">
                            融合多张参考素材与前沿模型协议，快速构建商业级构图与高质感画面。
                        </p>
                    </div>

                    {/* 居中浮动生成坞 */}
                    {dockElement}

                    {/* 下方灵感发现区（使用首页精选灵感替代） */}
                    <InspirationSection
                        onSelectPrompt={(selectedPrompt) => {
                            setPrompt(selectedPrompt);
                        }}
                    />
                    </div>
                </div>
                </>
            ) : (
                /* 工作台模式（图 2 结构） */
                <>
                    <CanvasWorkspaceView
                        title={taskTitle}
                        onChangeTitle={handleChangeProjectTitle}
                        onBackToApps={onBack}
                        onToggleDiscovery={() => {
                            setGenerationMode("image");
                            setAgentOpen(false);
                            setViewMode("discovery");
                        }}
                        projects={projects}
                        activeProjectId={activeProjectId}
                        projectSidebarCollapsed={projectSidebarCollapsed}
                        onChangeProjectSidebarCollapsed={setProjectSidebarCollapsed}
                        onCreateProject={handleCreateProject}
                        onSelectProject={loadProject}
                        onRenameProject={handleRenameProject}
                        onDeleteProject={handleDeleteProject}
                        onTogglePinProject={handleTogglePinProject}
                        currentResults={currentResults}
                        isGenerating={isGenerating}
                        generationStage={generationStage}
                        generationRatio={params.ratio}
                        onSendToCanvas={handleSendToCanvas}
                        generationMode={generationMode}
                        agentPreparing={agentPreparing}
                        onChangeGenerationMode={handleChangeGenerationMode}
                    >
                        {generationMode === "image" ? dockElement : null}
                    </CanvasWorkspaceView>
                    {generationMode === "agent" && agentCanvasId ? (
                        <CanvasCloudAgentPanel
                            key={agentCanvasId}
                            canvasId={agentCanvasId}
                            nodeCount={agentCanvasProject?.nodes.length || 0}
                            references={agentMentionReferences}
                            prefillPrompt={prompt}
                            open={agentOpen}
                            onOpen={() => setAgentOpen(true)}
                            onCollapse={() => setAgentOpen(false)}
                        />
                    ) : null}
                </>
            )}

        </div>
    );
}

export default ImageGeneratorWorkspace;
