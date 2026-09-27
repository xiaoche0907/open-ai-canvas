import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Coins, Download, FolderOpen, Footprints, Glasses, Heart, ImagePlus, ListTodo, Loader2, Maximize2, Minus, Palette, PersonStanding, Plus, RotateCcw, Save, ScanFace, Search, Shirt, Sparkles, ThumbsDown, ThumbsUp, Trash2, UploadCloud, UserPlus, Wand2, X } from "lucide-react";

import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { AppModal } from "@/components/ui/product/app-modal";
import { localForageStorageForScope } from "@/lib/localforage-storage";
import { imageSizeForResolution, buildImageResolutionOptions } from "@/lib/image-resolution-tiers";
import { defaultImageCapabilityConfig, modelCapabilityConfigFor, normalizeImageValue } from "@/lib/model-capabilities";
import { modelQuoteRequest, priceTierSummaryLabel, requestCreditCost } from "@/lib/model-pricing";
import type { ModelRequirements } from "@/lib/model-selection";
import { getActiveUserScope } from "@/lib/user-scope";
import { runBackendGenerationTask, runBackendGenerationTaskBatch } from "@/services/api/generation-task";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { getRemoteAsset } from "@/services/api/user-data";
import { createProject, listProjects, updateProject } from "@/services/api/projects";
import { listUserPromptPreferences } from "@/services/api/auth";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { uploadImage } from "@/services/image-storage";
import { localSavedRemotePendingMessage, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { modelDisplayName, modelOptionName, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

import "./universal-tryon.css";

const outfitExample = "/images/apps/tryon/outfit.jpg";
const editorialExample = "/images/apps/tryon/editorial.jpg";
const demoVideos = [
    null,
    "/videos/apps/tryon/flat-tryon.mp4",
    "/videos/apps/tryon/shoes.mp4",
    "/videos/apps/tryon/accessories.mp4",
    "/videos/apps/tryon/change-model.mp4",
    "/videos/apps/tryon/pose.mp4",
    "/videos/apps/tryon/face.mp4",
    "/videos/apps/tryon/color.mp4",
] as const;
const recommendedModels = [
    { url: "/images/apps/tryon/model-female.png", name: "简约棚拍 · 女", local: false, gender: "female" as const },
    { url: "/images/apps/tryon/model-male.png", name: "简约棚拍 · 男", local: false, gender: "male" as const },
    { url: editorialExample, name: "都市街拍 · 女", local: false, gender: "female" as const },
] satisfies (PreviewImage & { gender: "female" | "male" })[];
const shoeExamples: PreviewImage[] = [
    { url: "/images/apps/tryon/shoe-loafer.png", name: "乐福鞋示例", local: false },
    { url: "/images/apps/tryon/shoe-sneaker.png", name: "帆布鞋示例", local: false },
    { url: "/images/apps/tryon/shoe-boot.png", name: "短靴示例", local: false },
];

interface PreviewImage {
    url: string;
    name: string;
    local: boolean;
    /** 本地图片保留 File 引用，生成前可兜底上传后端 */
    file?: File;
    storageKey?: string;
    assetId?: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
}

interface TryonResult {
    id: string;
    url: string;
    storageKey?: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    prompt: string;
    toolLabel: string;
    taskId: string;
    toolIndex: number;
    ratio: string;
    quality: string;
    assetId?: string;
    favorite: boolean;
    feedback?: "up" | "down" | null;
    createdAt: string;
}

const RESULTS_STORAGE_KEY = "universal-tryon.results";
const MODELS_STORAGE_KEY = "universal-tryon.models";
const TRYON_RESULTS_PROJECT_TYPE = "universal-tryon";
const TRYON_MODELS_PROJECT_TYPE = "tryon-models";

type FlatImageKind = "upper" | "lower" | "onepiece" | "jewelry" | "shoesBags";
type FlatImages = Record<FlatImageKind, PreviewImage[]>;
type ShoeImageKind = "pair" | "outer" | "inner";
type ShoeImages = Record<ShoeImageKind, PreviewImage | null>;
type AccessoryCategory = "bag" | "belt" | "necklace" | "glasses" | "watch" | "hat" | "ring";
const accessoryCategories: { key: AccessoryCategory; label: string }[] = [
    { key: "bag", label: "包包" }, { key: "belt", label: "腰带腰链" }, { key: "necklace", label: "项链" }, { key: "glasses", label: "墨镜眼镜" },
    { key: "watch", label: "手链手表" }, { key: "hat", label: "帽子" }, { key: "ring", label: "戒指" },
];
const accessoryExamples: Record<AccessoryCategory, PreviewImage[]> = Object.fromEntries(accessoryCategories.map(({ key, label }) => [key, Array.from({ length: key === "belt" ? 5 : 1 }, (_, index) => ({ url: `/images/apps/tryon/accessory-${key}${index ? `-${index + 1}` : ""}.png`, name: `${label}示例 ${index + 1}`, local: false }))])) as Record<AccessoryCategory, PreviewImage[]>;
const flatImageLabels: Record<FlatImageKind, string> = {
    upper: "上装", lower: "下装", onepiece: "连体服装", jewelry: "首饰搭配", shoesBags: "鞋包搭配",
};
const shoeImageLabels: Record<ShoeImageKind, string> = { pair: "双脚鞋图", outer: "单鞋外侧图", inner: "单鞋内侧图" };
const emptyFlatImages = (): FlatImages => ({ upper: [], lower: [], onepiece: [], jewelry: [], shoesBags: [] });
const emptyShoeImages = (): ShoeImages => ({ pair: null, outer: null, inner: null });
const emptyAccessoryImages = (): Record<AccessoryCategory, PreviewImage[]> => ({ bag: [], belt: [], necklace: [], glasses: [], watch: [], hat: [], ring: [] });

function ShoeImageField({ kind, image, onAdd, onRemove, onLibrary }: {
    kind: ShoeImageKind;
    image: PreviewImage | null;
    onAdd: (kind: ShoeImageKind, file: File) => void;
    onRemove: (kind: ShoeImageKind) => void;
    onLibrary: (kind: ShoeImageKind) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const label = shoeImageLabels[kind];
    return <div className={`tryon-shoe-field ${kind === "pair" ? "is-pair" : ""}`}>
        <input ref={input} className="tryon-visually-hidden" type="file" accept=".jpg,.jpeg,.png,.avif" aria-label={`上传${label}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) onAdd(kind, file); event.target.value = ""; }} />
        {image ? <div className="tryon-shoe-selected"><button type="button" className="tryon-shoe-replace" aria-label={`更换${label}`} onClick={() => input.current?.click()}><img src={image.url} alt={image.name} /><span>{label} · 点击更换</span></button><button type="button" className="tryon-shoe-remove" aria-label={`移除${label}`} onClick={() => onRemove(kind)}><X size={14} /></button></div> : <button type="button" className="tryon-shoe-dropzone" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) onAdd(kind, file); }} onPaste={(event) => { const file = event.clipboardData.files[0]; if (file) onAdd(kind, file); }}><UploadCloud size={21} /><strong>上传或拖入 / 粘贴【{label}】</strong></button>}
        <button type="button" className="tryon-library-button" onClick={() => onLibrary(kind)}><FolderOpen size={14} aria-hidden="true" />从资产库导入</button>
    </div>;
}

function FlatImageField({ kind, images, onAdd, onRemove, onLibrary }: {
    kind: FlatImageKind;
    images: PreviewImage[];
    onAdd: (kind: FlatImageKind, files: FileList | File[]) => void;
    onRemove: (kind: FlatImageKind, index: number) => void;
    onLibrary: (kind: FlatImageKind) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const label = flatImageLabels[kind];
    return <div className="tryon-flat-field">
        <div className="tryon-flat-field-heading"><strong>{label}</strong><span>{images.length} / 10 张</span></div>
        <input ref={input} className="tryon-visually-hidden" type="file" accept="image/*" multiple aria-label={`上传${label}图片`} onChange={(event) => { if (event.target.files) onAdd(kind, event.target.files); event.target.value = ""; }} />
        <button type="button" className="tryon-flat-dropzone" onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onAdd(kind, event.dataTransfer.files); }}><UploadCloud size={18} /><span>上传或拖入{label}图片</span></button>
        <button type="button" className="tryon-library-button" onClick={() => onLibrary(kind)}><FolderOpen size={14} aria-hidden="true" />从资产库导入</button>
        {images.length > 0 && <div className="tryon-upload-list">{images.map((image, index) => <div className="tryon-upload-item" key={`${image.url}-${index}`}><img src={image.url} alt={image.name} /><button type="button" aria-label={`移除${label}图片${image.name}`} onClick={() => onRemove(kind, index)}><X size={12} /></button></div>)}{images.length < 10 && <button type="button" className="tryon-upload-more" aria-label={`继续添加${label}图片`} onClick={() => input.current?.click()}><Plus size={19} /></button>}</div>}
    </div>;
}

const ratios = ["自动比例", "4:3", "3:4", "9:16", "16:9", "1:1", "3:2", "2:3"] as const;
const tools = [
    { label: "万物上身", icon: Shirt, input: "产品图", reference: "参考模特", summary: "上传商品，选择模特与画质，构思试穿画面。" },
    { label: "平铺人台", icon: PersonStanding, input: "平铺/人台图", reference: "参考模特", summary: "将平铺服装或人台照片转换为上身效果。" },
    { label: "鞋靴试穿", icon: Footprints, input: "鞋靴图", reference: "参考人物", summary: "上传鞋靴素材，预览自然的上脚画面。" },
    { label: "AI试戴", icon: Glasses, input: "配饰图", reference: "参考人物", summary: "为眼镜、帽饰和首饰寻找贴合的佩戴效果。" },
    { label: "AI换模特", icon: Sparkles, input: "原图", reference: "目标模特", summary: "保留商品特点，调整画面中的模特。" },
    { label: "模特换姿势", icon: PersonStanding, input: "原图", reference: "姿势参考", summary: "基于现有画面探索不同的人物姿态。" },
    { label: "AI换脸", icon: ScanFace, input: "原图", reference: "人脸参考", summary: "为现有画面选择新的面部参考。" },
    { label: "AI换色", icon: Palette, input: "原图", reference: "颜色参考", summary: "预览同一商品的不同颜色方案。" },
] as const;

function assetPreview(asset: ImageAsset): PreviewImage {
    const resourceId = resourceIdFromStorageKey(asset.data.storageKey);
    return { url: resourceId ? resourceFileUrl(resourceId) : asset.data.dataUrl || asset.coverUrl, name: asset.title, local: false, storageKey: asset.data.storageKey };
}

export function UniversalTryonWorkspace({ onBack }: { onBack: () => void }) {
    const { message } = App.useApp();
    const [activeToolIndex, setActiveToolIndex] = useState(0);
    const [currentTaskId, setCurrentTaskId] = useState(() => nanoid());
    const activeTool = tools[activeToolIndex];
    const [products, setProducts] = useState<PreviewImage[]>([]);
    const [flatMode, setFlatMode] = useState<"separates" | "onepiece">("separates");
    const [flatImages, setFlatImages] = useState<FlatImages>(emptyFlatImages);
    const [shoeViewMode, setShoeViewMode] = useState<"single" | "multi">("single");
    const [shoeImages, setShoeImages] = useState<ShoeImages>(emptyShoeImages);
    const [accessoryCategory, setAccessoryCategory] = useState<AccessoryCategory>("belt");
    const [accessoryImages, setAccessoryImages] = useState(emptyAccessoryImages);
    const [poseMode, setPoseMode] = useState<"smart" | "text" | "image">("smart");
    // 非「模特换姿势」工具的参考模特方式：智能模特 / 参考模特图
    const [modelMode, setModelMode] = useState<"smart" | "image">("smart");
    // 后端留存句柄：生成结果（universal-tryon）与人物列表（tryon-models）
    const resultsBackendIdRef = useRef<string | null>(null);
    const modelsBackendIdRef = useRef<string | null>(null);
    const modelsHydratedRef = useRef(false);
    const [modelImage, setModelImage] = useState<PreviewImage | null>(null);
    const [poseImages, setPoseImages] = useState<PreviewImage[]>([]);
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const [modelPickerTab, setModelPickerTab] = useState<"recommended" | "mine">("recommended");
    const [modelGender, setModelGender] = useState<"all" | "female" | "male">("all");
    const [myModels, setMyModels] = useState<PreviewImage[]>([]);
    const [consistentModel, setConsistentModel] = useState(false);
    const [description, setDescription] = useState("");
    const [fitMode, setFitMode] = useState<"standard" | "professional">("professional");
    const [quality, setQuality] = useState<"1K" | "2K" | "4K">("2K");
    const [ratio, setRatio] = useState<(typeof ratios)[number]>("自动比例");
    const [count, setCount] = useState(1);
    const [pickerTarget, setPickerTarget] = useState<"products" | "model" | "accessory" | FlatImageKind | ShoeImageKind | null>(null);
    const [productError, setProductError] = useState("");
    const [mainTab, setMainTab] = useState<"results" | "examples">("examples");
    const [results, setResults] = useState<TryonResult[]>([]);
    // 结果按「当前任务 × 当前功能（工具）」双重隔离展示
    const visibleResults = results.filter((item) => item.toolIndex === activeToolIndex && item.taskId === currentTaskId);
    const genCount = Math.max(1, Math.min(Math.floor(Number(count) || 1), 4));
    const hasGeneratedResults = visibleResults.length > 0;
    // 任务列表：按 taskId 分组（只展示当前功能的任务），用于任务抽屉回溯
    const taskGroups = (() => {
        const byTask = new Map<string, TryonResult[]>();
        for (const item of results) {
            if (item.toolIndex !== activeToolIndex) continue;
            const list = byTask.get(item.taskId) || [];
            list.push(item);
            byTask.set(item.taskId, list);
        }
        return [...byTask.entries()].map(([taskId, list]) => {
            const first = list[0];
            return {
                taskId,
                toolLabel: first.toolLabel,
                toolIndex: first.toolIndex,
                thumb: first.url,
                count: list.length,
                quality: first.quality,
                ratio: first.ratio,
                createdAt: list.reduce((max, item) => (item.createdAt > max ? item.createdAt : max), first.createdAt),
            };
        }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    })();
    const [isGenerating, setIsGenerating] = useState(false);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewZoom, setPreviewZoom] = useState(100);
    const [aiWriting, setAiWriting] = useState(false);
    const [aiWriteTemplate, setAiWriteTemplate] = useState<string | null>(null);
    const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
    const productInput = useRef<HTMLInputElement>(null);
    const accessoryInput = useRef<HTMLInputElement>(null);
    const productDropzone = useRef<HTMLButtonElement>(null);
    const modelInput = useRef<HTMLInputElement>(null);
    const localUrls = useRef<string[]>([]);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const selectedModel = config.imageModel;
    const modelAvailable = effectiveConfig.imageModels.includes(selectedModel);
    const selectedChannel = selectedModel ? resolveModelChannel(effectiveConfig, selectedModel) : null;
    const pickerItems = useMemo<AssetLibraryPickerItem[]>(() => assets.filter((asset): asset is ImageAsset => asset.kind === "image" && asset.status !== "archived").map((asset) => ({
        id: asset.id,
        title: asset.title,
        category: "all",
        kindLabel: "图片",
        mediaKind: "image",
        asset,
    })), [assets]);
    const isFlatTryon = activeToolIndex === 1;
    const isShoeTryon = activeToolIndex === 2;
    const isAccessoryTryon = activeToolIndex === 3;
    const accessoryLabel = accessoryCategories.find((item) => item.key === accessoryCategory)!.label;
    const currentAccessoryImages = accessoryImages[accessoryCategory];
    const shoeAngleCount = Object.values(shoeImages).filter(Boolean).length;
    const outfitCount = isFlatTryon ? flatMode === "separates" ? Math.min(flatImages.upper.length, flatImages.lower.length) : flatImages.onepiece.length : isShoeTryon && shoeViewMode === "multi" ? Number(shoeAngleCount > 0) : isAccessoryTryon ? currentAccessoryImages.length : products.length;
    const outfitPreview = isFlatTryon ? (flatMode === "separates" ? flatImages.upper[0] || flatImages.lower[0] : flatImages.onepiece[0]) : isShoeTryon && shoeViewMode === "multi" ? shoeImages.pair || shoeImages.outer || shoeImages.inner : isAccessoryTryon ? currentAccessoryImages[0] : products[0];
    const flatImageInputCount = flatMode === "separates" ? 2 : 1;

    const quoteRequest = useMemo(() => {
        if (!creditsEnabled || !selectedModel || !modelAvailable || !outfitCount) return undefined;
        const profile = modelCapabilityConfigFor(config, selectedModel)?.image || defaultImageCapabilityConfig(undefined, selectedModel);
        const tier = quality.toLowerCase() as "1k" | "2k" | "4k";
        const resolutionOptions = buildImageResolutionOptions(profile.size.values);
        const requestedSize = resolutionOptions.length
            ? imageSizeForResolution(resolutionOptions, tier, ratio === "自动比例" ? resolutionOptions.find((option) => option.tier === tier)?.ratio || "" : ratio)
            : ratio === "自动比例" ? profile.size.default : ratio;
        if (!requestedSize) return undefined;
        const normalized = normalizeImageValue(profile, { size: requestedSize, quality: tier, count: "1" });
        if (normalized.size !== requestedSize || normalized.quality !== tier) return undefined;
        const quoteConfig = { ...effectiveConfig, model: selectedModel, imageModel: selectedModel, size: normalized.size, quality: normalized.quality, count: "1" };
        const requirements: ModelRequirements = {
            capability: "image",
            input: { textCount: 1, imageCount: (isFlatTryon ? flatImageInputCount + flatImages.jewelry.length + flatImages.shoesBags.length : isShoeTryon && shoeViewMode === "multi" ? shoeAngleCount : 1) + (poseMode === "image" ? poseImages.length : 0), videoCount: 0, audioCount: 0, characterCount: 0 },
            imageSize: normalized.size,
            options: { size: normalized.size, quality: normalized.quality, count: 1 },
        };
        return modelQuoteRequest(quoteConfig, selectedModel, "image", requirements);
    }, [config, creditsEnabled, effectiveConfig, flatImageInputCount, flatImages.jewelry.length, flatImages.shoesBags.length, isFlatTryon, isShoeTryon, modelAvailable, modelImage, outfitCount, poseImages.length, poseMode, quality, ratio, selectedModel, shoeAngleCount, shoeViewMode]);
    const quoteKey = JSON.stringify(quoteRequest || null);

    // 可用图片模型 + 每张价格（选择器展示）
    const imageModelOptions = useMemo(() => {
        return selectableModelsByCapability(config, "image").map((model) => {
            const channel = resolveModelChannel(config, model);
            const cost = channel?.modelCosts?.find((item) => item.model === modelOptionName(model));
            const price = cost ? priceTierSummaryLabel(cost.logicalPriceTiers || [], "image") : "";
            const suffix = price && price !== "未配置" ? ` · ${price}` : "";
            return { model, label: `${modelDisplayName(config, model)}${suffix}` };
        });
    }, [config]);

    // 当前模型每张积分（前端按渠道价格档位计算；无档位时回退首档标量价）
    const unitPrice = useMemo(() => {
        if (!selectedModel || !selectedChannel) return null;
        const matched = requestCreditCost({ channelMode: config.channelMode, modelCosts: selectedChannel.modelCosts, model: selectedModel, count: "1", capability: "image", config });
        if (matched !== null && matched > 0) return matched;
        const cost = selectedChannel.modelCosts?.find((item) => item.model === modelOptionName(selectedModel));
        if (cost?.unitPriceMicrocredits && cost.unitPriceMicrocredits > 0) return cost.unitPriceMicrocredits / 1_000_000;
        return null;
    }, [config, selectedModel, selectedChannel]);

    const estimateTotal = unitPrice !== null ? unitPrice * outfitCount * count : null;
    const [quoteState, setQuoteState] = useState<{ key: string; quote?: LogicalModelQuote; error?: boolean } | null>(null);

    useEffect(() => {
        if (!quoteRequest) {
            setQuoteState(null);
            return;
        }
        const controller = new AbortController();
        setQuoteState(null);
        quoteModel(quoteRequest, controller.signal)
            .then(({ quote }) => setQuoteState({ key: quoteKey, quote }))
            .catch(() => { if (!controller.signal.aborted) setQuoteState({ key: quoteKey, error: true }); });
        return () => controller.abort();
        // quoteKey captures the normalized request without refetching on object identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quoteKey]);

    const currentQuote = quoteState?.key === quoteKey ? quoteState : null;
    const totalCredits = currentQuote?.quote
        ? ((currentQuote.quote.amountMicrocredits * outfitCount * count) / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 6 })
        : null;

    useEffect(() => () => localUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

    // —— 结果持久化（按用户 scope，localForage）——
    const persistResults = useCallback(async (next: TryonResult[]) => {
        try {
            const storage = localForageStorageForScope(getActiveUserScope());
            await storage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(next));
        } catch (err) {
            console.warn("[UniversalTryon] Failed to persist results:", err);
        }
    }, []);

    // 生成结果云端留存：结果图片已入「我的资产」，这里留存索引到 type=universal-tryon 项目
    const syncResultsToBackend = useCallback(async (next: TryonResult[]) => {
        try {
            const resultKeys = next.filter((item) => item.storageKey).map((item) => ({
                id: item.id,
                storageKey: item.storageKey!,
                prompt: item.prompt,
                toolLabel: item.toolLabel,
                taskId: item.taskId,
                toolIndex: item.toolIndex,
                ratio: item.ratio,
                quality: item.quality,
                createdAt: item.createdAt,
                ...(item.assetId ? { assetId: item.assetId } : {}),
            }));
            const description = JSON.stringify({ v: 1, results: resultKeys });
            const firstKey = next.find((item) => item.storageKey)?.storageKey;
            const coverResourceId = firstKey ? resourceIdFromStorageKey(firstKey) : undefined;
            if (resultsBackendIdRef.current) {
                await updateProject(resultsBackendIdRef.current, { name: "万物上身生成记录", description, ...(coverResourceId ? { coverResourceId } : {}) });
                return;
            }
            const created = await createProject({
                name: "万物上身生成记录",
                type: TRYON_RESULTS_PROJECT_TYPE,
                aspectRatio: "1:1",
                sourceType: "ai-tryon",
                description,
                ...(coverResourceId ? { coverResourceId } : {}),
            });
            if (created?.project?.id) resultsBackendIdRef.current = created.project.id;
        } catch (err) {
            console.warn("[UniversalTryon] Failed to sync results to backend:", err);
        }
    }, []);

    // —— 人物列表（我的模特）持久化：本地 + 云端（type=tryon-models）——
    const persistModels = useCallback(async (next: PreviewImage[]) => {
        try {
            const storage = localForageStorageForScope(getActiveUserScope());
            await storage.setItem(MODELS_STORAGE_KEY, JSON.stringify(next.filter((item) => item.storageKey).map((item) => ({ name: item.name, storageKey: item.storageKey }))));
        } catch (err) {
            console.warn("[UniversalTryon] Failed to persist models:", err);
        }
    }, []);

    const syncModelsToBackend = useCallback(async (models: PreviewImage[]) => {
        try {
            const modelKeys = models.filter((item) => item.storageKey).map((item) => ({ storageKey: item.storageKey!, name: item.name, createdAt: Date.now() }));
            const description = JSON.stringify({ v: 1, models: modelKeys });
            const firstKey = models.find((item) => item.storageKey)?.storageKey;
            const coverResourceId = firstKey ? resourceIdFromStorageKey(firstKey) : undefined;
            if (modelsBackendIdRef.current) {
                await updateProject(modelsBackendIdRef.current, { name: "我的模特", description, ...(coverResourceId ? { coverResourceId } : {}) });
                return;
            }
            const created = await createProject({
                name: "我的模特",
                type: TRYON_MODELS_PROJECT_TYPE,
                aspectRatio: "1:1",
                sourceType: "ai-tryon",
                description,
                ...(coverResourceId ? { coverResourceId } : {}),
            });
            if (created?.project?.id) modelsBackendIdRef.current = created.project.id;
        } catch (err) {
            console.warn("[UniversalTryon] Failed to sync models to backend:", err);
        }
    }, []);

    // 模特列表变化（新增/上传补 key）后：本地 + 云端同步
    useEffect(() => {
        if (!modelsHydratedRef.current) return;
        const synced = myModels.filter((item) => item.storageKey);
        // 列表为空且后端尚无项目时不创建空项目
        if (!synced.length && !modelsBackendIdRef.current) return;
        void persistModels(synced);
        void syncModelsToBackend(synced);
    }, [myModels, persistModels, syncModelsToBackend]);

    useEffect(() => {
        let mounted = true;
        const loadResults = async () => {
            try {
                const storage = localForageStorageForScope(getActiveUserScope());
                const raw = await storage.getItem(RESULTS_STORAGE_KEY);
                let local: TryonResult[] = [];
                if (raw) {
                    const parsed = JSON.parse(String(raw)) as TryonResult[];
                    if (Array.isArray(parsed)) local = parsed
                        .filter((item): item is TryonResult => !!item && typeof item === "object" && typeof item.url === "string")
                        .map((item) => ({ ...item, toolIndex: item.toolIndex ?? 0, taskId: item.taskId || `legacy-${item.storageKey || item.id}` }));
                }
                let cloud: TryonResult[] = [];
                let backendId: string | null = null;
                try {
                    const data = await listProjects();
                    const entry = (data?.projects || []).find((item) => item.project?.type === TRYON_RESULTS_PROJECT_TYPE);
                    if (entry?.project) {
                        const backend = entry.project;
                        backendId = backend.id;
                        const desc = JSON.parse(backend.description || "");
                        if (desc && Array.isArray(desc.results)) {
                            cloud = desc.results.filter((item: { storageKey?: string }) => item?.storageKey).map((item: { id?: string; storageKey: string; prompt?: string; toolLabel?: string; taskId?: string; toolIndex?: number; ratio?: string; quality?: string; createdAt?: string; assetId?: string }) => ({
                                id: item.id || `cloud-${backend.id}-${item.storageKey}`,
                                url: resourceFileUrl(resourceIdFromStorageKey(item.storageKey)),
                                storageKey: item.storageKey,
                                width: 0,
                                height: 0,
                                bytes: 0,
                                mimeType: "image/png",
                                prompt: item.prompt || "",
                                toolLabel: item.toolLabel || "万物上身",
                                taskId: item.taskId || `legacy-${item.storageKey}`,
                                toolIndex: item.toolIndex ?? 0,
                                ratio: item.ratio || "自动比例",
                                quality: item.quality || "2K",
                                ...(item.assetId ? { assetId: item.assetId } : {}),
                                favorite: false,
                                feedback: null,
                                createdAt: item.createdAt || backend.createdAt,
                            }));
                        }
                    }
                } catch (err) {
                    console.warn("[UniversalTryon] Failed to load cloud results:", err);
                }
                if (backendId) resultsBackendIdRef.current = backendId;
                if (mounted) {
                    const cloudIds = new Set(cloud.map((item) => item.id));
                    const merged = [...cloud, ...local.filter((item) => !cloudIds.has(item.id))];
                    setResults(merged);
                    if (merged.length) void persistResults(merged);
                    if (!backendId && merged.length) void syncResultsToBackend(merged);
                }
            } catch (err) {
                console.warn("[UniversalTryon] Failed to load results:", err);
            }
        };
        void loadResults();
        return () => { mounted = false; };
    }, []);

    // AI 帮写角色模板：后端 prompt_templates（operation=tryon_ai_write），未配置时回退内置文案
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { preferences } = await listUserPromptPreferences();
                if (cancelled) return;
                const pref = preferences.find((p) => p.definition.operation === "tryon_ai_write");
                if (!pref) return;
                const base = pref.template?.content || "";
                const custom = pref.customization;
                let content = base;
                if (custom && custom.mode === "append" && base) content = `${base}\n\n【用户个性化创作要求】\n${custom.content}`;
                else if (custom && custom.mode === "rewrite") content = custom.content;
                if (content.trim()) setAiWriteTemplate(content);
            } catch (err) {
                console.warn("[UniversalTryon] Failed to load ai-write template:", err);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // 人物列表加载：本地 + 云端（type=tryon-models）合并
    useEffect(() => {
        let mounted = true;
        const loadModels = async () => {
            try {
                const storage = localForageStorageForScope(getActiveUserScope());
                const raw = await storage.getItem(MODELS_STORAGE_KEY);
                let local: PreviewImage[] = [];
                if (raw) {
                    const parsed = JSON.parse(String(raw)) as Array<{ name?: string; storageKey?: string }>;
                    if (Array.isArray(parsed)) local = parsed.filter((item) => item?.storageKey).map((item) => ({ url: resourceFileUrl(resourceIdFromStorageKey(item.storageKey!)), name: item.name || "我的模特", local: false, storageKey: item.storageKey }));
                }
                let cloud: PreviewImage[] = [];
                let backendId: string | null = null;
                try {
                    const data = await listProjects();
                    const entry = (data?.projects || []).find((item) => item.project?.type === TRYON_MODELS_PROJECT_TYPE);
                    if (entry?.project) {
                        const backend = entry.project;
                        backendId = backend.id;
                        const desc = JSON.parse(backend.description || "");
                        if (desc && Array.isArray(desc.models)) {
                            cloud = desc.models.filter((item: { storageKey?: string }) => item?.storageKey).map((item: { storageKey: string; name?: string }) => ({ url: resourceFileUrl(resourceIdFromStorageKey(item.storageKey)), name: item.name || "我的模特", local: false, storageKey: item.storageKey }));
                        }
                    }
                } catch (err) {
                    console.warn("[UniversalTryon] Failed to load cloud models:", err);
                }
                if (backendId) modelsBackendIdRef.current = backendId;
                if (mounted) {
                    const cloudKeys = new Set(cloud.map((item) => item.storageKey));
                    const merged = [...cloud, ...local.filter((item) => !item.storageKey || !cloudKeys.has(item.storageKey))];
                    setMyModels(merged);
                    if (!backendId && merged.length) void syncModelsToBackend(merged);
                }
            } catch (err) {
                console.warn("[UniversalTryon] Failed to load models:", err);
            } finally {
                modelsHydratedRef.current = true;
            }
        };
        void loadModels();
        return () => { mounted = false; };
    }, []);

    // 上传中的任务缓存：同一张本地图只上传一次（后台上传失败时生成前会兜底重传）
    const inFlightUploads = useRef(new Map<string, Promise<PreviewImage>>());

    const patchUploadedImage = useCallback((localUrl: string, patch: PreviewImage) => {
        const apply = (img: PreviewImage) => img.url === localUrl ? { ...patch } : img;
        setProducts((current) => current.map(apply));
        setFlatImages((current) => Object.fromEntries(Object.entries(current).map(([kind, list]) => [kind, list.map(apply)])) as FlatImages);
        setShoeImages((current) => Object.fromEntries(Object.entries(current).map(([kind, img]) => [kind, img ? apply(img) : img])) as ShoeImages);
        setAccessoryImages((current) => Object.fromEntries(Object.entries(current).map(([kind, list]) => [kind, list.map(apply)])) as Record<AccessoryCategory, PreviewImage[]>);
        setMyModels((current) => current.map(apply));
        setPoseImages((current) => current.map(apply));
        setModelImage((current) => (current?.url === localUrl ? { ...patch } : current));
    }, []);

    // 上传到后端并加入「我的资产」，返回远端引用；示例图（无 file）先拉取成 File 再上传
    const uploadToAssets = useCallback(async (image: PreviewImage): Promise<PreviewImage> => {
        if (image.storageKey) return image;
        if (!image.file && !image.url) return image;
        const inFlight = inFlightUploads.current.get(image.url);
        if (inFlight) return inFlight;
        const promise = (async () => {
            let file = image.file;
            if (!file) {
                const response = await fetch(image.url!);
                if (!response.ok) throw new Error(`无法加载示例图片（${response.status}）`);
                const blob = await response.blob();
                file = new File([blob], image.name || "example.png", { type: blob.type || "image/png" });
            }
            const uploaded = await uploadImage(file);
            const assetId = addAsset({
                kind: "image",
                title: `试穿素材: ${image.name.slice(0, 30)}`,
                coverUrl: uploaded.url,
                category: "material",
                tags: ["AI应用", "试穿"],
                data: {
                    dataUrl: uploaded.url,
                    storageKey: uploaded.storageKey,
                    width: uploaded.width || 1024,
                    height: uploaded.height || 1024,
                    bytes: uploaded.bytes || file.size,
                    mimeType: uploaded.mimeType || file.type,
                },
            });
            const resolved: PreviewImage = {
                ...image,
                url: uploaded.url,
                storageKey: uploaded.storageKey,
                assetId,
                width: uploaded.width,
                height: uploaded.height,
                bytes: uploaded.bytes,
                mimeType: uploaded.mimeType,
            };
            patchUploadedImage(image.url, resolved);
            return resolved;
        })();
        inFlightUploads.current.set(image.url, promise);
        try {
            return await promise;
        } finally {
            inFlightUploads.current.delete(image.url);
        }
    }, [addAsset, patchUploadedImage]);

    const makePreview = (file: File): PreviewImage => {
        const url = URL.createObjectURL(file);
        localUrls.current.push(url);
        return { url, name: file.name, local: true, file };
    };

    // 后台上传（失败静默，生成前会兜底重传）
    const queueBackgroundUpload = (preview: PreviewImage) => {
        void uploadToAssets(preview).catch(() => { /* 生成阶段兜底 */ });
    };

    const addProducts = (files: FileList | File[]) => {
        const images = Array.from(files).filter((file) => isShoeTryon ? ["image/jpeg", "image/png", "image/avif"].includes(file.type) && file.size <= 20 * 1024 * 1024 : file.type.startsWith("image/"));
        if (images.length !== files.length) message.warning(isShoeTryon ? "鞋靴图片须为 JPG、PNG 或 AVIF，且不超过 20 MB" : "仅支持上传图片文件");
        const available = Math.max(0, 10 - products.length);
        if (images.length > available) message.warning(`${activeTool.input}最多上传 10 张`);
        if (images.length) setProductError("");
        const previews = images.slice(0, available).map(makePreview);
        setProducts([...products, ...previews]);
        previews.forEach(queueBackgroundUpload);
    };

    const addAccessoryImages = (files: FileList | File[]) => {
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (images.length !== files.length) message.warning("仅支持上传图片文件");
        const available = Math.max(0, 10 - currentAccessoryImages.length);
        if (images.length > available) message.warning(`${accessoryLabel}商品图最多上传 10 张`);
        if (images.length) setProductError("");
        const previews = images.slice(0, available).map(makePreview);
        setAccessoryImages((current) => ({ ...current, [accessoryCategory]: [...current[accessoryCategory], ...previews] }));
        previews.forEach(queueBackgroundUpload);
    };

    const removeAccessoryImage = (index: number) => {
        const removed = currentAccessoryImages[index];
        if (removed?.local) URL.revokeObjectURL(removed.url);
        setAccessoryImages((current) => ({ ...current, [accessoryCategory]: current[accessoryCategory].filter((_, itemIndex) => itemIndex !== index) }));
    };

    const addFlatImages = (kind: FlatImageKind, files: FileList | File[]) => {
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (images.length !== files.length) message.warning("仅支持上传图片文件");
        const available = Math.max(0, 10 - flatImages[kind].length);
        if (images.length > available) message.warning(`${flatImageLabels[kind]}最多上传 10 张`);
        if (images.length) setProductError("");
        const previews = images.slice(0, available).map(makePreview);
        setFlatImages((current) => ({ ...current, [kind]: [...current[kind], ...previews] }));
        previews.forEach(queueBackgroundUpload);
    };

    const removeFlatImage = (kind: FlatImageKind, index: number) => {
        const removed = flatImages[kind][index];
        if (removed?.local) URL.revokeObjectURL(removed.url);
        setFlatImages((current) => ({ ...current, [kind]: current[kind].filter((_, itemIndex) => itemIndex !== index) }));
    };

    const addShoeImage = (kind: ShoeImageKind, file: File) => {
        if (!["image/jpeg", "image/png", "image/avif"].includes(file.type) || file.size > 20 * 1024 * 1024) {
            message.warning("鞋靴图片须为 JPG、PNG 或 AVIF，且不超过 20 MB");
            return;
        }
        const previous = shoeImages[kind];
        if (previous?.local) URL.revokeObjectURL(previous.url);
        const preview = makePreview(file);
        setShoeImages((current) => ({ ...current, [kind]: preview }));
        setProductError("");
        queueBackgroundUpload(preview);
    };

    const removeShoeImage = (kind: ShoeImageKind) => {
        const removed = shoeImages[kind];
        if (removed?.local) URL.revokeObjectURL(removed.url);
        setShoeImages((current) => ({ ...current, [kind]: null }));
    };

    const selectShoeExample = (image: PreviewImage) => {
        if (shoeViewMode === "multi") {
            const previous = shoeImages.pair;
            if (previous?.local) URL.revokeObjectURL(previous.url);
            setShoeImages((current) => ({ ...current, pair: image }));
        } else {
            setProducts((current) => current.some((item) => item.url === image.url) ? current : [...current, image].slice(0, 10));
        }
        setProductError("");
    };

    const importAssets = async (ids: string[]) => {
        const selected = await Promise.all(ids.map(async (id) => {
            const local = assets.find((asset): asset is ImageAsset => asset.id === id && asset.kind === "image");
            if (local) return assetPreview(local);
            const { asset } = await getRemoteAsset(id);
            if (asset.kind !== "image") throw new Error("请选择图片素材");
            return assetPreview(asset);
        }));
        if (pickerTarget === "model") {
            const image = selected[0] || null;
            setModelImage(image);
            if (image) setMyModels((current) => current.some((item) => item.url === image.url) ? current : [image, ...current]);
        } else if (pickerTarget === "pair" || pickerTarget === "outer" || pickerTarget === "inner") {
            const image = selected[0];
            if (image) {
                const previous = shoeImages[pickerTarget];
                if (previous?.local) URL.revokeObjectURL(previous.url);
                setShoeImages((current) => ({ ...current, [pickerTarget]: image }));
                setProductError("");
            }
        } else if (pickerTarget === "accessory") {
            setAccessoryImages((current) => ({ ...current, [accessoryCategory]: [...current[accessoryCategory], ...selected.filter((image) => !current[accessoryCategory].some((item) => item.url === image.url))].slice(0, 10) }));
            setProductError("");
        } else if (pickerTarget && pickerTarget !== "products") {
            const kind = pickerTarget;
            setFlatImages((current) => ({ ...current, [kind]: [...current[kind], ...selected.filter((image) => !current[kind].some((item) => item.url === image.url))].slice(0, 10) }));
            setProductError("");
        } else {
            setProducts((current) => [...current, ...selected.filter((image) => !current.some((item) => item.url === image.url))].slice(0, 10));
            setProductError("");
        }
        setPickerTarget(null);
    };

    const removeProduct = (index: number) => {
        const removed = products[index];
        if (removed?.local) URL.revokeObjectURL(removed.url);
        setProducts(products.filter((_, itemIndex) => itemIndex !== index));
    };

    const reset = () => {
        products.forEach((image) => { if (image.local) URL.revokeObjectURL(image.url); });
        Object.values(flatImages).flat().forEach((image) => { if (image.local) URL.revokeObjectURL(image.url); });
        Object.values(shoeImages).forEach((image) => { if (image?.local) URL.revokeObjectURL(image.url); });
        Object.values(accessoryImages).flat().forEach((image) => { if (image.local) URL.revokeObjectURL(image.url); });
        setProducts([]);
        setFlatImages(emptyFlatImages());
        setFlatMode("separates");
        setShoeImages(emptyShoeImages());
        setShoeViewMode("single");
        setAccessoryImages(emptyAccessoryImages());
        setAccessoryCategory("belt");
        setModelImage(null);
        setPoseImages([]);
        setPoseMode("smart");
        setModelMode("smart");
        setModelPickerOpen(false);
        setConsistentModel(false);
        setDescription("");
        setFitMode("professional");
        setQuality("2K");
        setRatio("自动比例");
        setCount(1);
        setProductError("");
        if (productInput.current) productInput.current.value = "";
        if (accessoryInput.current) accessoryInput.current.value = "";
        if (modelInput.current) modelInput.current.value = "";
    };

    // 按工具与换姿模式组装生成提示词
    const buildTryonPrompt = (): string => {
        const parts: string[] = [];
        switch (activeToolIndex) {
            case 0:
                parts.push("将商品图中的服装真实地穿搭到参考模特身上，保持服装版型、材质、图案与颜色准确还原，人物姿态自然，光线真实、质感细腻");
                break;
            case 1:
                parts.push("将平铺服装图或人台图转换为模特上身效果，服装贴合人体自然垂坠，版型与细节准确还原");
                break;
            case 2:
                parts.push("将鞋靴商品图自然地穿到参考人物的脚上，符合脚部结构与透视，鞋型与细节准确还原，画面真实自然");
                break;
            case 3:
                parts.push(`将${accessoryLabel}商品图真实地佩戴在参考人物身上，位置自然贴合，商品特征与细节准确还原`);
                break;
            case 4:
                parts.push("保留原图中的商品特征与细节，将画面中的模特替换为目标参考模特，姿态与光线自然衔接");
                break;
            case 5:
                parts.push("保持原图中的人物与商品不变，仅调整人物的姿势与动作，姿势自然协调");
                break;
            case 6:
                parts.push("将人脸参考图中的面部特征应用到原图人物脸上，五官自然融合，表情协调");
                break;
            default:
                parts.push("保留原图的商品与构图，将商品替换为参考颜色方案，色调统一自然");
        }
        if (activeToolIndex === 5) {
            if (poseMode === "smart") {
                parts.push("采用自然展示姿势，人物全身入镜，姿态大方自然");
                if (consistentModel) parts.push("保持同一模特与场景，多张结果人物形象与场景一致");
            } else if (poseMode === "text") {
                if (description.trim()) parts.push(`人物姿势与画面细节要求：${description.trim()}`);
            } else {
                parts.push("参考姿势图的人物姿态与构图");
            }
        } else if (modelMode === "smart") {
            parts.push("采用自然展示姿势，人物全身入镜，姿态大方自然");
            if (consistentModel) parts.push("保持同一模特与场景，多张结果人物形象与场景一致");
        } else if (modelImage) {
            parts.push("参考模特图中的人物形象、气质与姿态");
        }
        parts.push(fitMode === "professional" ? "专业电商质感，细节优先，光影自然，高清画质" : "标准模式，快速出图，画面自然真实");
        return parts.join("，");
    };

    // 生成前校验（与旧逻辑一致）
    const validateBeforeGenerate = (): boolean => {
        if (isFlatTryon && !outfitCount) {
            setProductError(flatMode === "separates" ? "请先上传上装和下装图片" : "请先上传连体服装图片");
            return false;
        }
        if (isShoeTryon && !outfitCount) {
            setProductError(shoeViewMode === "multi" ? "请至少上传一张鞋靴角度图" : "请先上传鞋靴商品图");
            return false;
        }
        if (isAccessoryTryon && !outfitCount) {
            setProductError(`请先上传${accessoryLabel}商品图，或选择示例图片`);
            return false;
        }
        if (!isFlatTryon && !isShoeTryon && !isAccessoryTryon && !products.length) {
            setProductError(`请先上传${activeTool.input}${activeToolIndex === 0 ? "，或选择示例图片" : ""}`);
            productDropzone.current?.focus();
            return false;
        }
        if (!selectedModel || !modelAvailable) {
            message.warning("请先在设置中选择可用的图片模型");
            return false;
        }
        return true;
    };

    const handleGenerate = async () => {
        if (isGenerating || !validateBeforeGenerate()) return;

        // 收集本次生成的全部输入图（商品图 + 参考模特/姿势图）
        const inputImages: PreviewImage[] = isFlatTryon
            ? [...flatImages.upper, ...flatImages.lower, ...(flatMode === "onepiece" ? flatImages.onepiece : []), ...flatImages.jewelry, ...flatImages.shoesBags]
            : isShoeTryon && shoeViewMode === "multi"
                ? [shoeImages.pair, shoeImages.outer, shoeImages.inner].filter((img): img is PreviewImage => !!img)
                : isAccessoryTryon ? currentAccessoryImages : products;
        const modelRefs: PreviewImage[] = activeToolIndex === 5
            ? (poseMode === "image" ? poseImages : modelImage ? [modelImage] : [])
            : (modelMode === "image" && modelImage ? [modelImage] : []);

        setIsGenerating(true);
        setMainTab("results");
        try {
            // 确保所有本地图片已上传后端（后台上传失败时兜底重传）
            const targets = [...inputImages, ...modelRefs];
            const uploadedImages = await Promise.all(targets.map((image) => uploadToAssets(image).catch((err) => { throw new Error(`「${image.name}」上传失败：${err instanceof Error ? err.message : "未知错误"}`); })));
            const refPayload = uploadedImages.map((image) => ({
                id: nanoid(),
                name: image.name,
                type: image.mimeType || "image/png",
                dataUrl: image.url,
                url: image.url,
                storageKey: image.storageKey,
                width: image.width,
                height: image.height,
                bytes: image.bytes,
            }));

            const prompt = buildTryonPrompt();
            const imageProfile = modelCapabilityConfigFor(config, selectedModel)?.image || defaultImageCapabilityConfig(undefined, selectedModel);
            // 「自动比例」时回落到模型默认比例，避免把非尺寸值传给后端
            const resolvedRatio = ratio === "自动比例" ? imageProfile.size.default || "1:1" : ratio;
            const normalized = normalizeImageValue(imageProfile, { size: resolvedRatio, quality, count: String(count) });
            const requestConfig = {
                ...effectiveConfig,
                model: selectedModel,
                imageModel: selectedModel,
                size: normalized.size || resolvedRatio,
                quality: normalized.quality || quality,
                count: normalized.count || String(count),
            };
            const taskCount = Math.max(1, Math.min(imageProfile.maxOutputs, Math.floor(Number(count) || 1)));
            const metadata = { source: "ai-apps-universal-tryon", tool: activeTool.label, poseMode, ratio, quality, fitMode };

            let rawImages: Array<{ dataUrl: string; storageKey?: string; width?: number; height?: number; bytes?: number; mimeType?: string }> = [];
            if (taskCount > 1) {
                const settled = await runBackendGenerationTaskBatch({
                    mode: "image",
                    prompt,
                    config: { ...requestConfig, count: "1" },
                    referenceImages: refPayload,
                    count: taskCount,
                    metadata,
                    onTaskUpdate: (task) => { if (task.status === "running") { /* 批量渲染中 */ } },
                });
                rawImages = settled.flatMap((entry) => (entry.status === "fulfilled" && entry.value.images ? entry.value.images : []));
                if (!rawImages.length) {
                    const fail = settled.find((e) => e.status === "rejected");
                    throw (fail && "reason" in fail && fail.reason instanceof Error) ? fail.reason : new Error("模型未返回有效图片结果");
                }
            } else {
                const result = await runBackendGenerationTask({
                    mode: "image",
                    prompt,
                    config: requestConfig,
                    referenceImages: refPayload,
                    metadata,
                    onTaskUpdate: (task) => { if (task.status === "running") { /* 渲染中 */ } },
                });
                rawImages = result.images || [];
                if (!rawImages.length) throw new Error("模型未返回有效图片结果");
            }

            const now = new Date().toISOString();
            const newResults: TryonResult[] = rawImages.map((img) => {
                const assetId = addAsset({
                    kind: "image",
                    title: `${activeTool.label}: ${prompt.slice(0, 20)}`,
                    coverUrl: img.dataUrl,
                    category: "material",
                    tags: ["AI应用", "试穿"],
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
                    prompt,
                    toolLabel: activeTool.label,
                    taskId: currentTaskId,
                    toolIndex: activeToolIndex,
                    ratio: normalized.size || ratio,
                    quality: normalized.quality || quality,
                    assetId,
                    favorite: false,
                    feedback: null,
                    createdAt: now,
                };
            });

            const nextResults = [...newResults, ...results];
            setResults(nextResults);
            void persistResults(nextResults);
            void syncResultsToBackend(nextResults);
            setMainTab("results");
            try {
                await saveRemoteUserDataNow();
                message.success(`已生成 ${newResults.length} 张图片，并全部入库「我的资产」`);
            } catch (syncErr) {
                message.warning(localSavedRemotePendingMessage(`已生成 ${newResults.length} 张图片并保存在本地`, syncErr));
            }
        } catch (err) {
            console.error("[UniversalTryon] Generation error:", err);
            setMainTab("examples");
            message.error(err instanceof Error ? err.message : "生成失败，请重试");
        } finally {
            setIsGenerating(false);
        }
    };

    // AI 帮写：根据商品与工具类型生成描述
    const handleAIWrite = async () => {
        if (aiWriting) return;
        if (!outfitCount) {
            message.warning("请先上传商品图，AI 帮写才能根据商品生成描述");
            return;
        }
        const textModel = config.textModel || effectiveConfig.textModels[0];
        if (!textModel) {
            message.warning("未配置可用的文本模型");
            return;
        }
        setAiWriting(true);
        try {
            const renderedTemplate = aiWriteTemplate
                ? aiWriteTemplate
                    .replaceAll("{{工具}}", activeTool.label)
                    .replaceAll("{{商品}}", activeToolIndex === 3 ? `${accessoryLabel}配饰` : activeTool.input)
                    .replaceAll("{{参考方式}}", activeToolIndex === 5 ? (poseMode === "smart" ? "智能换姿" : poseMode === "text" ? "文字换姿" : "以图换姿") : (modelMode === "smart" ? "智能模特" : "参考模特图"))
                : null;
            const result = await runBackendGenerationTask({
                mode: "text",
                prompt: renderedTemplate ?? `你是电商试穿场景文案助手。请根据以下信息为 AI 试穿生成一段精炼的中文画面描述（不超过 80 字，只输出描述正文，不要任何解释或前缀）：工具=${activeTool.label}，商品=${activeToolIndex === 3 ? `${accessoryLabel}配饰` : activeTool.input}，参考方式=${activeToolIndex === 5 ? (poseMode === "smart" ? "智能换姿" : poseMode === "text" ? "文字换姿" : "以图换姿") : (modelMode === "smart" ? "智能模特" : "参考模特图")}。描述应包含模特形象、姿态与场景氛围，可直接用于 AI 出图提示词。`,
                config: { ...effectiveConfig, model: textModel, textModel },
                metadata: { source: "ai-apps-universal-tryon", operation: "ai-write" },
                streamText: false,
                onTaskUpdate: (task) => { if (task.status === "running") { /* 生成中 */ } },
            });
            const text = result.text?.trim();
            if (!text) throw new Error("模型未返回描述");
            setDescription((current) => current ? `${current}\n${text}` : text);
            message.success("AI 帮写完成，已填入描述");
        } catch (err) {
            console.error("[UniversalTryon] AI write error:", err);
            message.error(err instanceof Error ? err.message : "AI 帮写失败，请重试");
        } finally {
            setAiWriting(false);
        }
    };

    const chooseModel = (image: PreviewImage) => {
        if (poseMode === "image") {
            setPoseImages((current) => (current.some((item) => item.url === image.url) ? current : [...current, image]));
        } else {
            setModelImage(image);
        }
        setModelPickerOpen(false);
    };

    const addOwnModel = (file: File) => {
        if (!file.type.startsWith("image/")) { message.warning("请选择图片文件"); return; }
        const image = makePreview(file);
        setMyModels((current) => [image, ...current]);
        chooseModel(image);
        queueBackgroundUpload(image);
    };
    const removeModel = (image: PreviewImage) => {
        setMyModels((current) => current.filter((item) => item.url !== image.url || item.storageKey !== image.storageKey));
        setModelImage((current) => (current?.url === image.url ? null : current));
        setPoseImages((current) => current.filter((item) => item.url !== image.url));
    };

    // 删除整组任务（本地 + 云端索引同步），删除当前任务时新建空任务上下文
    const removeTask = (taskId: string) => {
        const next = results.filter((item) => item.taskId !== taskId);
        setResults(next);
        void persistResults(next);
        void syncResultsToBackend(next);
        if (currentTaskId === taskId) setCurrentTaskId(nanoid());
    };

    interface SavedPrompt {
        id: string;
        title: string;
        content: string;
        updatedAt: number;
    }
    const PROMPTS_KEY = "universal-tryon.saved-prompts";
    const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
    const [promptCreateOpen, setPromptCreateOpen] = useState(false);
    const [promptSearch, setPromptSearch] = useState("");
    const [promptDraftTitle, setPromptDraftTitle] = useState("");
    const [promptDraftContent, setPromptDraftContent] = useState("");
    const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(() => {
        try {
            const raw = localStorage.getItem(PROMPTS_KEY);
            const parsed: unknown = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter((item): item is SavedPrompt => !!item && typeof item === "object" && typeof (item as SavedPrompt).content === "string") : [];
        } catch { return []; }
    });
    const persistPrompts = (next: SavedPrompt[]) => {
        setSavedPrompts(next);
        try { localStorage.setItem(PROMPTS_KEY, JSON.stringify(next)); } catch { /* 存储不可用时仅保留当前会话 */ }
    };
    const insertPromptContent = (content: string) => {
        setDescription((current) => current ? `${current}\n${content}` : content);
        setPromptLibraryOpen(false);
        message.success("已插入提示词");
    };
    const openPromptCreate = (fromDescription: boolean) => {
        setPromptDraftTitle("");
        setPromptDraftContent(fromDescription ? description : "");
        setPromptCreateOpen(true);
    };
    const submitPrompt = () => {
        const content = promptDraftContent.trim();
        if (!content) { message.warning("请填写提示词内容"); return; }
        const item: SavedPrompt = { id: `${Date.now()}`, title: promptDraftTitle.trim() || "未命名提示词", content, updatedAt: Date.now() };
        persistPrompts([item, ...savedPrompts]);
        setPromptCreateOpen(false);
        message.success("已保存到我的提示词");
    };

    const copyExampleConfig = () => {
        setPreviewOpen(false);
        reset();
        setActiveToolIndex(0);
        setProducts([{ url: outfitExample, name: "示例穿搭", local: false }]);
        setPoseMode("smart");
        setModelImage({ url: editorialExample, name: "示例人物", local: false });
        setFitMode("standard");
        setQuality("2K");
        setRatio("2:3");
        setMainTab("examples");
        message.success("已填入示例配置，可继续调整");
    };

    const toggleFavorite = (id: string) => {
        setResults((current) => {
            const target = current.find((item) => item.id === id);
            if (!target) return current;
            const next = current.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item);
            void persistResults(next);
            return next;
        });
    };

    const setFeedbackFor = (id: string, value: "up" | "down") => {
        setResults((current) => {
            const next = current.map((item) => item.id === id ? { ...item, feedback: item.feedback === value ? null : value } : item);
            void persistResults(next);
            return next;
        });
    };

    const feedbackButtons = (resultId: string, className: string) => <div className={className} role="group" aria-label="结果反馈">
        <button type="button" aria-label="喜欢该结果" aria-pressed={results.find((r) => r.id === resultId)?.feedback === "up"} onClick={() => setFeedbackFor(resultId, "up")}><ThumbsUp size={15} /></button>
        <button type="button" aria-label="不喜欢该结果" aria-pressed={results.find((r) => r.id === resultId)?.feedback === "down"} onClick={() => setFeedbackFor(resultId, "down")}><ThumbsDown size={15} /></button>
    </div>;

    const previewResult = results[previewIndex] || null;

    return (
        <div className="tryon-workspace">
            <header className="tryon-topbar">
                <div className="tryon-topbar-title">
                    <button type="button" className="tryon-icon-button" aria-label="返回 AI 应用" onClick={onBack}><ArrowLeft size={18} /></button>
                    <span className="tryon-topbar-mark"><Shirt size={17} /></span>
                    <strong>{activeTool.label}</strong>
                    <span className="tryon-topbar-caption">AI 视觉工作台</span>
                </div>
                <button type="button" className="tryon-reset-button tryon-mobile-task-button" onClick={() => setTaskDrawerOpen(true)}><ListTodo size={15} />任务列表</button>
            </header>

            <div className="tryon-layout">
                <nav className="tryon-tool-rail" aria-label="试穿工具">
                    <div className="tryon-tool-rail-list">
                        {tools.map((tool, index) => <button key={tool.label} type="button" className={activeToolIndex === index ? "is-current" : ""} aria-current={activeToolIndex === index ? "page" : undefined} onClick={() => { if (activeToolIndex !== index) { reset(); setActiveToolIndex(index); setCurrentTaskId(nanoid()); } }}>
                            <tool.icon size={20} strokeWidth={1.7} aria-hidden="true" />
                            <span>{tool.label}</span>
                        </button>)}
                    </div>
                    <div className="tryon-tool-rail-bottom">{hasGeneratedResults && <button type="button" onClick={() => setMainTab("results")}><RotateCcw size={18} aria-hidden="true" /><span>生成结果</span></button>}<button type="button" onClick={() => setPickerTarget(isFlatTryon ? flatMode === "separates" ? "upper" : "onepiece" : isShoeTryon && shoeViewMode === "multi" ? "pair" : isAccessoryTryon ? "accessory" : "products")}><FolderOpen size={18} aria-hidden="true" /><span>资源仓库</span></button></div>
                </nav>
                <aside className="tryon-sidebar" aria-label="试穿任务设置">
                    {isFlatTryon ? <section className="tryon-form-section">
                        <div className="tryon-field-heading"><span>服装平铺图 / 人台图</span></div>
                        <div className="tryon-flat-upload">
                            <div className="tryon-flat-tabs" role="group" aria-label="服装类型">
                                <button type="button" aria-pressed={flatMode === "separates"} className={flatMode === "separates" ? "is-active" : ""} onClick={() => { setFlatMode("separates"); setProductError(""); }}><Shirt size={17} />换上下装</button>
                                <button type="button" aria-pressed={flatMode === "onepiece"} className={flatMode === "onepiece" ? "is-active" : ""} onClick={() => { setFlatMode("onepiece"); setProductError(""); }}><PersonStanding size={17} />换连体</button>
                            </div>
                            <div className="tryon-flat-fields">
                                {(flatMode === "separates" ? ["upper", "lower"] : ["onepiece"]).map((kind) => <FlatImageField key={kind} kind={kind as FlatImageKind} images={flatImages[kind as FlatImageKind]} onAdd={addFlatImages} onRemove={removeFlatImage} onLibrary={setPickerTarget} />)}
                            </div>
                            <div className="tryon-flat-pairing"><strong>搭配 <span className="tryon-optional">选填</span></strong><p>添加首饰、鞋或包，让完整穿搭更贴近你的设想。</p>
                                <FlatImageField kind="jewelry" images={flatImages.jewelry} onAdd={addFlatImages} onRemove={removeFlatImage} onLibrary={setPickerTarget} />
                                <FlatImageField kind="shoesBags" images={flatImages.shoesBags} onAdd={addFlatImages} onRemove={removeFlatImage} onLibrary={setPickerTarget} />
                            </div>
                        </div>
                        {productError && <p className="tryon-field-error" role="alert">{productError}</p>}
                        <p className="tryon-field-tip">图片建议不小于 300 × 300 px，主体清晰、无遮挡。{flatMode === "separates" && "上装和下装按上传顺序成套。"}</p>
                    </section> : isShoeTryon ? <section className="tryon-form-section">
                        <div className="tryon-field-heading"><span>鞋靴商品图</span></div>
                        <div className="tryon-shoe-upload">
                            <div className="tryon-flat-tabs" role="group" aria-label="鞋靴图片角度">
                                <button type="button" aria-pressed={shoeViewMode === "single"} className={shoeViewMode === "single" ? "is-active" : ""} onClick={() => { setShoeViewMode("single"); setProductError(""); }}><Footprints size={17} />单视角图</button>
                                <button type="button" aria-pressed={shoeViewMode === "multi"} className={shoeViewMode === "multi" ? "is-active" : ""} onClick={() => { setShoeViewMode("multi"); setProductError(""); }}><Footprints size={17} />多视角图 <span className="tryon-member-badge"><Sparkles size={10} />会员</span></button>
                            </div>
                            {shoeViewMode === "single" ? <div className="tryon-shoe-single">
                                <input ref={productInput} id="tryon-product-input" className="tryon-visually-hidden" type="file" accept=".jpg,.jpeg,.png,.avif" multiple aria-label="上传单视角鞋靴商品图" onChange={(event) => { if (event.target.files) addProducts(event.target.files); event.target.value = ""; }} />
                                <button ref={productDropzone} type="button" className="tryon-shoe-dropzone" onClick={() => productInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addProducts(event.dataTransfer.files); }} onPaste={(event) => { if (event.clipboardData.files.length) addProducts(event.clipboardData.files); }}><UploadCloud size={22} /><strong>上传或拖入 / 粘贴鞋靴图片</strong><span>单张产品图或同款不同角度，最多 10 张</span></button>
                                <button type="button" className="tryon-library-button" onClick={() => setPickerTarget("products")}><FolderOpen size={14} aria-hidden="true" />从资产库导入</button>
                                {products.length > 0 && <div className="tryon-upload-list">{products.map((image, index) => <div className="tryon-upload-item" key={`${image.url}-${index}`}><img src={image.url} alt={image.name} /><button type="button" aria-label={`移除${image.name}`} onClick={() => removeProduct(index)}><X size={12} /></button></div>)}{products.length < 10 && <button type="button" className="tryon-upload-more" aria-label="继续添加鞋靴图片" onClick={() => productInput.current?.click()}><Plus size={19} /></button>}</div>}
                            </div> : <div className="tryon-shoe-multi">
                                <ShoeImageField kind="pair" image={shoeImages.pair} onAdd={addShoeImage} onRemove={removeShoeImage} onLibrary={setPickerTarget} />
                                <div className="tryon-shoe-angle-row"><ShoeImageField kind="outer" image={shoeImages.outer} onAdd={addShoeImage} onRemove={removeShoeImage} onLibrary={setPickerTarget} /><ShoeImageField kind="inner" image={shoeImages.inner} onAdd={addShoeImage} onRemove={removeShoeImage} onLibrary={setPickerTarget} /></div>
                            </div>}
                            <div className="tryon-shoe-examples"><span>示例</span><div>{shoeExamples.map((image) => <button key={image.url} type="button" aria-label={`使用${image.name}`} aria-pressed={shoeViewMode === "multi" ? shoeImages.pair?.url === image.url : products.some((item) => item.url === image.url)} onClick={() => selectShoeExample(image)}><img src={image.url} alt="" loading="lazy" /></button>)}</div></div>
                            <p className="tryon-shoe-tip">本地图片不超过 20 MB，支持 JPG、JPEG、PNG、AVIF；主体清晰、背景简洁。</p>
                        </div>
                        {productError && <p className="tryon-field-error" role="alert">{productError}</p>}
                    </section> : isAccessoryTryon ? <section className="tryon-form-section">
                        <div className="tryon-field-heading"><span>商品类型</span></div>
                        <div className="tryon-accessory-categories" role="group" aria-label="试戴商品类型">
                            {accessoryCategories.map(({ key, label }) => <button key={key} type="button" className={accessoryCategory === key ? "is-active" : ""} aria-pressed={accessoryCategory === key} onClick={() => { setAccessoryCategory(key); setProductError(""); }}>{label}</button>)}
                        </div>
                        <div className="tryon-field-heading"><label htmlFor="tryon-accessory-input">{accessoryLabel}商品图</label><span>{currentAccessoryImages.length} / 10 张</span></div>
                        <div className="tryon-accessory-upload">
                            <input ref={accessoryInput} id="tryon-accessory-input" className="tryon-visually-hidden" type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) addAccessoryImages(event.target.files); event.target.value = ""; }} />
                            <button type="button" className="tryon-accessory-dropzone" onClick={() => accessoryInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addAccessoryImages(event.dataTransfer.files); }} onPaste={(event) => { if (event.clipboardData.files.length) addAccessoryImages(event.clipboardData.files); }}><UploadCloud size={22} /><strong>上传 / 或拖拽至此 / 粘贴【{accessoryLabel}商品图】</strong></button>
                            <button type="button" className="tryon-library-button" onClick={() => setPickerTarget("accessory")}><FolderOpen size={14} aria-hidden="true" />从资产库导入</button>
                            {currentAccessoryImages.length > 0 && <div className="tryon-upload-list">{currentAccessoryImages.map((image, index) => <div className="tryon-upload-item" key={`${image.url}-${index}`}><img src={image.url} alt={image.name} /><button type="button" aria-label={`移除${image.name}`} onClick={() => removeAccessoryImage(index)}><X size={12} /></button></div>)}{currentAccessoryImages.length < 10 && <button type="button" className="tryon-upload-more" aria-label={`继续添加${accessoryLabel}商品图`} onClick={() => accessoryInput.current?.click()}><Plus size={19} /></button>}</div>}
                            <div className="tryon-accessory-examples"><span>示例</span><div>{accessoryExamples[accessoryCategory].map((image) => <button key={image.url} type="button" aria-label={`使用${image.name}`} aria-pressed={currentAccessoryImages.some((item) => item.url === image.url)} onClick={() => { setAccessoryImages((current) => ({ ...current, [accessoryCategory]: current[accessoryCategory].some((item) => item.url === image.url) ? current[accessoryCategory] : [...current[accessoryCategory], image].slice(0, 10) })); setProductError(""); }}><img src={image.url} alt="" loading="lazy" /></button>)}</div></div>
                            <p className="tryon-accessory-tip"><strong>Tips.</strong> 上传希望佩戴的商品静物图，不建议模特图。</p>
                        </div>
                        {productError && <p className="tryon-field-error" role="alert">{productError}</p>}
                    </section> :
                    <section className="tryon-form-section">
                        <div className="tryon-field-heading"><label htmlFor="tryon-product-input">{activeTool.input} <span className="tryon-required">必填</span></label><span>{products.length} / 10 张</span></div>
                        <input ref={productInput} id="tryon-product-input" className="tryon-visually-hidden" type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) addProducts(event.target.files); event.target.value = ""; }} />
                        <div className="tryon-upload-card">
                            <button ref={productDropzone} type="button" className="tryon-dropzone" aria-describedby={productError ? "tryon-product-error" : undefined} onClick={() => productInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addProducts(event.dataTransfer.files); }}>
                                <span className="tryon-dropzone-icon"><UploadCloud size={20} /></span>
                                <strong>上传或拖入{activeTool.input}</strong>
                                <span>支持常见图片格式 · 最多 10 张</span>
                            </button>
                            <button type="button" className="tryon-library-button" onClick={() => setPickerTarget("products")}><FolderOpen size={14} aria-hidden="true" />从资产库导入</button>
                            {activeToolIndex === 0 && products.length === 0 && <div className="tryon-example-row"><span>示例</span><button type="button" aria-label="使用示例产品图" onClick={() => { setProducts([{ url: outfitExample, name: "示例穿搭", local: false }]); setProductError(""); }}><img src={outfitExample} alt="" /><span>使用示例</span></button></div>}
                        </div>
                        {products.length > 0 ? (
                            <div className="tryon-upload-list">
                                {products.map((image, index) => <div className="tryon-upload-item" key={`${image.url}-${index}`}><img src={image.url} alt={image.name} /><button type="button" aria-label={`移除${image.name}`} onClick={() => removeProduct(index)}><X size={12} /></button></div>)}
                                {products.length < 10 && <button type="button" className="tryon-upload-more" aria-label="继续添加产品图" onClick={() => productInput.current?.click()}><Plus size={19} /></button>}
                            </div>
                        ) : null}
                        {productError && <p id="tryon-product-error" className="tryon-field-error" role="alert">{productError}</p>}
                        <p className="tryon-field-tip">图片建议不小于 300 × 300 px，主体清晰、无遮挡。</p>
                    </section>}

                    <section className="tryon-form-section tryon-reference-section">
                        <div className="tryon-field-heading"><span>{activeTool.reference}</span><CircleHelp size={14} aria-label={activeToolIndex === 5 ? "支持智能换姿、文字描述或参考姿势图" : "支持自动生成模特或上传参考模特图"} /></div>
                        <div className="tryon-reference-body">
                        {activeToolIndex === 5 ? (
                            <>
                            <div className="tryon-mode-tabs" role="group" aria-label="姿势参考方式">
                                <button type="button" aria-pressed={poseMode === "smart"} className={poseMode === "smart" ? "is-active" : ""} onClick={() => setPoseMode("smart")}>智能换姿</button>
                                <button type="button" aria-pressed={poseMode === "text"} className={poseMode === "text" ? "is-active" : ""} onClick={() => setPoseMode("text")}>文字换姿</button>
                                <button type="button" aria-pressed={poseMode === "image"} className={poseMode === "image" ? "is-active" : ""} onClick={() => setPoseMode("image")}>以图换姿</button>
                            </div>
                            {poseMode === "smart" ? (
                                <div className="tryon-pose-smart">
                                    <div className="tryon-smart-card"><span className="tryon-smart-icon"><Sparkles size={20} /></span><div><strong>一键生成多姿势模特图</strong><p>无需输入文字或姿势参考图，自动匹配人物与场景。</p></div><Check size={16} className="tryon-smart-check" /></div>
                                    <div className="tryon-pose-sample"><img src={modelImage?.url || editorialExample} alt="多姿势示例" /></div>
                                    <span className="tryon-pose-count-tip">生成张数：建议 4 张</span>
                                </div>
                            ) : poseMode === "text" ? (
                                <div className="tryon-pose-text">
                                    {modelImage && <div className="tryon-pose-text-ref"><img src={modelImage.url} alt={modelImage.name} /><span>{modelImage.name}</span><button type="button" aria-label="移除参考图" onClick={() => setModelImage(null)}><X size={12} /></button></div>}
                                    <div className="tryon-field-heading tryon-pose-text-heading"><label htmlFor="tryon-pose-description">姿势描述 <span className="tryon-optional">非必填</span></label><CircleHelp size={14} aria-label="用文字描述期望的人物姿势与画面细节" /></div>
                                    <textarea id="tryon-pose-description" className="tryon-pose-textarea" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="将图中模特调整为一个更具创意和时尚感的姿势。" rows={3} />
                                    <div className="tryon-pose-tools">
                                        <button type="button" onClick={handleAIWrite} disabled={aiWriting}><Wand2 size={14} />{aiWriting ? "生成中…" : "AI 帮写"}</button>
                                        <button type="button" onClick={() => setPromptLibraryOpen(true)}><BookOpen size={14} />词库</button>
                                        <button type="button" aria-label="保存当前提示词" title="保存当前提示词" onClick={() => { if (!description.trim()) { message.warning("请先填写描述内容"); return; } openPromptCreate(true); }}><Save size={14} /></button>

                                        <span>{description.length} / 2000</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="tryon-pose-image">
                                    {poseImages.length === 0 ? (
                                        <button type="button" className="tryon-pose-upload" onClick={() => setModelPickerOpen(true)}>
                                            <span className="tryon-pose-upload-icon"><PersonStanding size={26} /></span>
                                            <strong>选择目标姿势模特</strong>
                                            <span>支持选择多个模特及姿势</span>
                                        </button>
                                    ) : (
                                        <div className="tryon-pose-list">
                                            {poseImages.map((image) => <div className="tryon-pose-item" key={image.url}><img src={image.url} alt={image.name} /><button type="button" aria-label={`移除${image.name}`} onClick={() => setPoseImages((current) => current.filter((item) => item.url !== image.url))}><X size={12} /></button></div>)}
                                            <button type="button" className="tryon-pose-add-more" aria-label="继续添加姿势模特" onClick={() => setModelPickerOpen(true)}><Plus size={18} /></button>
                                        </div>
                                    )}
                                    <p className="tryon-pose-tips"><span>Tips.</span>建议上传人物占比较大的清晰模特图，以获得更好的姿势效果。</p>
                                </div>
                            )}
                            {poseMode === "smart" && <div className="tryon-form-section tryon-description-section">
                                <div className="tryon-field-heading"><label htmlFor="tryon-description">额外描述（非必填）</label><CircleHelp size={14} aria-label="可描述模特形象、姿态和场景" /></div>
                                <div className="tryon-textarea-wrap"><textarea id="tryon-description" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="模特：年轻女性，长发，自然站姿&#10;场景：都市街头，晴天&#10;风格：休闲通勤，简约时尚" rows={5} /><div className="tryon-desc-tools"><button type="button" onClick={handleAIWrite} disabled={aiWriting}><Wand2 size={13} />{aiWriting ? "生成中…" : "AI 帮写"}</button><button type="button" onClick={() => setPromptLibraryOpen(true)}><BookOpen size={13} />词库</button><button type="button" aria-label="保存当前提示词" title="保存当前提示词" onClick={() => { if (!description.trim()) { message.warning("请先填写描述内容"); return; } openPromptCreate(true); }}><Save size={13} /></button><span className="tryon-desc-count">{description.length} / 2000 <button type="button" aria-label="清空额外描述" onClick={() => setDescription("")}><X size={13} /></button></span></div></div>
                            </div>}
                            {poseMode === "smart" && <label className="tryon-consistent-row"><span>模特和场景一致 <CircleHelp size={13} aria-hidden="true" /></span><input type="checkbox" checked={consistentModel} onChange={(event) => setConsistentModel(event.target.checked)} /><span className="tryon-switch" aria-hidden="true" /></label>}
                            </>
                        ) : (
                            <>
                            <div className="tryon-mode-tabs is-two" role="group" aria-label="参考模特方式">
                                <button type="button" aria-pressed={modelMode === "smart"} className={modelMode === "smart" ? "is-active" : ""} onClick={() => setModelMode("smart")}>智能模特</button>
                                <button type="button" aria-pressed={modelMode === "image"} className={modelMode === "image" ? "is-active" : ""} onClick={() => setModelMode("image")}>参考模特图</button>
                            </div>
                            {modelMode === "smart" ? (
                                <div className="tryon-model-smart">
                                    <div className="tryon-smart-head">
                                        <label className="tryon-smart-option"><input type="checkbox" checked readOnly aria-hidden="true" /><span>一键生成匹配的模特图</span></label>
                                        <div className="tryon-smart-figure"><img src={modelImage?.url || editorialExample} alt="匹配模特示例" /></div>
                                    </div>
                                    <p className="tryon-smart-desc">深度解析商品，自动生成匹配的模特和场景</p>
                                </div>
                            ) : (
                                <div className="tryon-model-ref">
                                    {modelImage ? (
                                        <div className="tryon-model-ref-preview">
                                            <div className="tryon-model-ref-image"><img src={modelImage.url} alt={modelImage.name} /><button type="button" aria-label="移除参考图" onClick={() => setModelImage(null)}><X size={12} /></button></div>
                                            <button type="button" className="tryon-model-ref-select" onClick={() => setModelPickerOpen(true)}>更换参考图 <ChevronRight size={16} /></button>
                                        </div>
                                    ) : (
                                        <div className="tryon-model-ref-panel">
                                            <div className="tryon-model-ref-placeholder" aria-hidden="true">
                                                <svg viewBox="0 0 64 92" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <ellipse cx="32" cy="30" rx="15" ry="19" />
                                                    <path d="M12 86 C14 62 50 62 52 86" />
                                                    <path d="M7 54 C18 44 46 44 57 54" />
                                                </svg>
                                            </div>
                                            <button type="button" className="tryon-model-ref-select" onClick={() => setModelPickerOpen(true)}>选择参考图 <ChevronRight size={16} /></button>
                                        </div>
                                    )}
                                    <p className="tryon-pose-tips"><span>Tips.</span>每张参考图独立处理，效果分开展示</p>
                                </div>
                            )}
                            <div className="tryon-form-section tryon-description-section">
                                <div className="tryon-field-heading"><label htmlFor="tryon-description">额外描述（非必填）</label><CircleHelp size={14} aria-label="可描述模特形象、姿态和场景" /></div>
                                <div className="tryon-textarea-wrap"><textarea id="tryon-description" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={modelMode === "image" ? "通过文本描述模特形象、姿态或场景，对每一张所选的模特图进行调整。&#10;若需固定特定元素，请输入类似“保持背景/姿态不变”的文案，确保效果更稳定。&#10;示例：利落短发、自然侧身、保持背景不变。" : "模特：年轻女性，长发，自然站姿&#10;场景：都市街头，晴天&#10;风格：休闲通勤，简约时尚"} rows={5} /><div className="tryon-desc-tools"><button type="button" onClick={handleAIWrite} disabled={aiWriting}><Wand2 size={13} />{aiWriting ? "生成中…" : "AI 帮写"}</button><button type="button" onClick={() => setPromptLibraryOpen(true)}><BookOpen size={13} />词库</button><button type="button" aria-label="保存当前提示词" title="保存当前提示词" onClick={() => { if (!description.trim()) { message.warning("请先填写描述内容"); return; } openPromptCreate(true); }}><Save size={13} /></button><span className="tryon-desc-count">{description.length} / 2000 <button type="button" aria-label="清空额外描述" onClick={() => setDescription("")}><X size={13} /></button></span></div></div>
                            </div>
                            {modelMode === "smart" && <label className="tryon-consistent-row"><span>模特和场景一致 <CircleHelp size={13} aria-hidden="true" /></span><input type="checkbox" checked={consistentModel} onChange={(event) => setConsistentModel(event.target.checked)} /><span className="tryon-switch" aria-hidden="true" /></label>}
                            </>
                        )}
                        </div>
                    </section>

                    <section className="tryon-form-section">
                        <div className="tryon-field-heading"><span>生成模式</span></div>
                        <div className="tryon-choice-grid is-two" role="group" aria-label="生成模式">
                            <button type="button" aria-pressed={fitMode === "standard"} className={fitMode === "standard" ? "is-active" : ""} onClick={() => setFitMode("standard")}><strong>{activeToolIndex <= 1 ? "内衣/童装模式" : "标准模式"}</strong><small>{activeToolIndex <= 1 ? "适配内衣/童装" : "快速预览"}</small></button>
                            <button type="button" aria-pressed={fitMode === "professional"} className={fitMode === "professional" ? "is-active" : ""} onClick={() => setFitMode("professional")}><strong>专业模式</strong><small>{activeToolIndex <= 1 ? "效果好" : "细节优先"}</small></button>
                        </div>
                    </section>

                    <section className="tryon-form-section">
                        <div className="tryon-field-heading"><span>清晰度</span></div>
                        <div className="tryon-choice-grid is-three" role="group" aria-label="清晰度">{(["1K", "2K", "4K"] as const).map((option) => <button key={option} type="button" aria-pressed={quality === option} className={quality === option ? "is-active" : ""} onClick={() => setQuality(option)}>{option} 高清</button>)}</div>
                    </section>

                    <section className="tryon-form-section">
                        <div className="tryon-field-heading"><span>图片比例</span></div>
                        <div className="tryon-ratio-grid" role="group" aria-label="图片比例">{ratios.map((option) => <button key={option} type="button" aria-pressed={ratio === option} className={ratio === option ? "is-active" : ""} onClick={() => setRatio(option)}><span className={`tryon-ratio-glyph ratio-${option.replace(":", "-")}`} aria-hidden="true" />{option}</button>)}</div>
                    </section>

                    <section className="tryon-form-section">
                        <div className="tryon-field-heading"><label htmlFor="tryon-count">生成数量</label></div>
                        <div className="tryon-count-row"><span>{isFlatTryon ? "每套服装生成" : isShoeTryon && shoeViewMode === "multi" ? "每组鞋靴生成" : "每张素材生成"}</span><select id="tryon-count" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}</select><span>共 {outfitCount * count} 张</span></div>
                    </section>

                    <div className="tryon-sidebar-footer">
                        <div className="tryon-cost-preview" aria-live="polite">
                            <div><Coins size={15} aria-hidden="true" /><span>生成模型</span><select className="tryon-model-select" value={selectedModel || ""} aria-label="选择生成模型" onChange={(event) => { if (event.target.value) useConfigStore.getState().updateConfig("imageModel", event.target.value); }}>{imageModelOptions.map((option) => <option key={option.model} value={option.model}>{option.label}</option>)}</select></div>
                            <div><span>每张价格</span><strong>{unitPrice !== null ? `${unitPrice.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} 积分/张` : !selectedModel ? "请先设置模型" : "当前规格无法报价"}</strong></div>
                            <div><span>本次积分预估</span><strong>{!selectedModel ? "请先设置模型" : !modelAvailable ? "默认模型当前不可用" : !creditsEnabled || selectedChannel?.scope !== "system" ? "不使用系统积分" : !outfitCount ? "添加素材后显示" : estimateTotal !== null ? `${estimateTotal.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} 积分` : totalCredits !== null ? `${totalCredits} 积分` : currentQuote?.error ? "报价暂不可用" : "正在报价…"}</strong></div>
                        </div>
                        <button type="button" className="tryon-generate-button" onClick={handleGenerate} disabled={isGenerating}>{isGenerating ? <Loader2 size={17} className="tryon-spin" /> : <Sparkles size={17} />}{isGenerating ? "生成中…" : "立即生成"} {!isGenerating && <ArrowRight size={16} />}</button>
                        <span>费用仅供预估，以实际任务计费为准 · 生成结果将自动入库「我的资产」</span>
                    </div>
                </aside>

                <main className="tryon-main">
                    <div className="tryon-main-tabs" role="tablist" aria-label="作品区域">{(hasGeneratedResults || isGenerating) && <button type="button" role="tab" aria-selected={mainTab === "results"} className={mainTab === "results" ? "is-active" : ""} onClick={() => setMainTab("results")}>生成结果</button>}<button type="button" role="tab" aria-selected={!hasGeneratedResults || mainTab === "examples"} className={!hasGeneratedResults || mainTab === "examples" ? "is-active" : ""} onClick={() => setMainTab("examples")}>做同款</button></div>
                    {(hasGeneratedResults || isGenerating) && mainTab === "results" ? <div className="tryon-results" role="tabpanel">
                        <div className="tryon-results-header"><div><span className="tryon-result-dot" /><strong>{isGenerating ? "正在生成" : "生成结果"}</strong><span>{isGenerating ? `${genCount} 张 · ${quality} 高清 · ${ratio}` : `共 ${visibleResults.length} 张 · ${visibleResults[0]?.quality || "2K"} 高清 · ${visibleResults[0]?.ratio || "自动比例"}`}</span></div></div>
                        <div className="tryon-result-grid">
                            {isGenerating ? Array.from({ length: genCount }).map((_, index) => (
                                <div className="tryon-result-loading" key={`loading-${index}`}><span className="tryon-loading-spinner"><Loader2 size={24} /></span><strong>正在生成</strong><span>{activeTool.label} · 模型 {selectedModel} · 通常 20–60 秒</span></div>
                            )) : visibleResults.map((result, index) => (
                                <div className="tryon-result-card" key={result.id}>
                                    <button type="button" className="tryon-result-image" aria-label="放大查看结果" onClick={() => { setPreviewIndex(index); setPreviewZoom(100); setPreviewOpen(true); }}><img src={result.url} alt={`${result.toolLabel}生成结果`} loading="lazy" /></button>
                                    {feedbackButtons(result.id, "tryon-result-feedback")}
                                    <div className="tryon-result-actions">
                                        <button type="button" aria-label="放大查看结果" onClick={() => { setPreviewIndex(index); setPreviewZoom(100); setPreviewOpen(true); }}><Maximize2 size={16} /></button>
                                        <button type="button" aria-label="收藏结果" aria-pressed={result.favorite} onClick={() => toggleFavorite(result.id)}><Heart size={16} fill={result.favorite ? "currentColor" : "none"} /></button>
                                        <a href={result.url} download={`${result.toolLabel}-${result.id}.jpg`} aria-label="下载结果图片"><Download size={16} /></a>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {!isGenerating && <p className="tryon-results-note">生成结果已自动入库「我的资产」，可随时在资产库中复用。</p>}
                    </div> : <div className="tryon-main-inner" role="tabpanel">
                        <div className="tryon-intro"><span className="tryon-eyebrow">AI FASHION STUDIO</span><h2>{activeToolIndex === 0 ? "所见即所穿" : activeTool.label}</h2><p>{activeToolIndex === 0 ? "从商品素材到真实穿搭，预览每一种可能。" : activeTool.summary}</p></div>
                        {activeToolIndex === 0 ? <>
                        <div className="tryon-showcase" aria-label="万物上身示例流程">
                            <div className="tryon-showcase-topline"><span>创作预览</span><span className="tryon-demo-badge">示例演示</span></div>
                            <div className="tryon-showcase-grid">
                                <div className="tryon-showcase-panel"><div className="tryon-showcase-image is-product"><img src={products[0]?.url || outfitExample} alt="产品穿搭示例" /></div><span className="tryon-panel-index">01</span><strong>产品素材</strong></div>
                                <div className="tryon-flow-arrow"><Plus size={18} /></div>
                                <div className="tryon-showcase-panel"><div className="tryon-showcase-image"><img src={(poseMode === "image" ? poseImages[0]?.url : modelImage?.url) || editorialExample} alt="参考模特示例" /></div><span className="tryon-panel-index">02</span><strong>{poseMode === "smart" ? "智能换姿" : poseMode === "text" ? "文字换姿" : "姿势参考图"}</strong></div>
                                <div className="tryon-flow-arrow"><ArrowRight size={18} /></div>
                                <div className="tryon-showcase-panel is-result"><div className="tryon-showcase-image"><img src={editorialExample} alt="虚拟试穿效果示例" /></div><span className="tryon-panel-index">03</span><strong>自然试穿效果</strong></div>
                            </div>
                            <p className="tryon-showcase-note">一键呈现贴合人物姿态、光影与衣物质感的穿搭画面</p>
                        </div>

                        <section className="tryon-inspiration" aria-labelledby="tryon-inspiration-title"><div className="tryon-section-heading"><div><span className="tryon-eyebrow">INSPIRATION</span><h3 id="tryon-inspiration-title">创作灵感</h3></div><span>从单品到完整造型</span></div><div className="tryon-inspiration-grid"><article><div className="tryon-inspiration-image"><img loading="lazy" src={outfitExample} alt="完整穿搭产品平铺" /></div><div><span>搭配输入</span><strong>多件单品，一次搭配</strong></div></article><article><div className="tryon-inspiration-image"><img loading="lazy" src={editorialExample} alt="都市街头试穿示例" /></div><div><span>效果参考</span><strong>自然姿态与真实光影</strong></div></article></div></section>
                        </> : <section className="tryon-demo-video" aria-label={`${activeTool.label}功能演示`}><div className="tryon-showcase-topline"><span>功能演示</span></div><video key={activeToolIndex} src={demoVideos[activeToolIndex] || undefined} autoPlay muted loop playsInline preload="metadata" aria-label={`${activeTool.label}展示视频`} /></section>}
                    </div>}
                </main>
                <nav className="tryon-right-rail" aria-label="任务入口"><button type="button" onClick={() => setTaskDrawerOpen(true)} aria-label="打开任务列表"><ListTodo size={18} /><span><span>任</span><span>务</span><span>列</span><span>表</span></span></button></nav>
            </div>
            <AppDrawer open={taskDrawerOpen} onClose={() => setTaskDrawerOpen(false)} placement="right" size="min(350px, 100vw)" title={null} closable={false} flush rootClassName="tryon-task-drawer">
                <div className="tryon-task-panel">
                    <div className="tryon-task-panel-header"><div><ListTodo size={18} /><strong>任务列表</strong></div><div className="tryon-task-panel-actions"><button type="button" className="tryon-task-new" onClick={() => { reset(); setCurrentTaskId(nanoid()); setMainTab("examples"); setTaskDrawerOpen(false); }}><Plus size={14} />新建任务</button><button type="button" className="tryon-task-close" aria-label="关闭任务列表" onClick={() => setTaskDrawerOpen(false)}><X size={19} /></button></div></div>
                    <button type="button" className="tryon-task-draft" onClick={() => setTaskDrawerOpen(false)}><span className="tryon-task-thumb">{outfitPreview ? <img src={outfitPreview.url} alt="当前配置的商品素材" /> : <Shirt size={23} />}</span><span><strong>继续创建</strong><small>{outfitCount ? isFlatTryon ? `${activeTool.label} · 已选 ${outfitCount} 套服装` : isShoeTryon && shoeViewMode === "multi" ? `${activeTool.label} · 已选 ${shoeAngleCount} 张角度图` : `${activeTool.label} · 已选 ${outfitCount} 张${isAccessoryTryon ? `${accessoryLabel}商品图` : activeTool.input}` : `${activeTool.label} · 未开始`}</small></span><ArrowRight size={15} /></button>
                    <div className="tryon-task-divider"><span>最近 30 天 · {taskGroups.length} 个生成任务</span></div>
                    {taskGroups.length > 0 ? <div className="tryon-task-list">
                        {taskGroups.map((task) => <div key={task.taskId} className="tryon-task-item-wrap"><button type="button" className={`tryon-task-item${task.taskId === currentTaskId ? " is-current" : ""}`} onClick={() => { setActiveToolIndex(task.toolIndex); setCurrentTaskId(task.taskId); setTaskDrawerOpen(false); setMainTab("results"); }}><span className="tryon-task-thumb"><img src={task.thumb} alt={task.toolLabel} /></span><span><strong>{task.toolLabel}{task.taskId === currentTaskId ? " · 当前任务" : ""}</strong><small>{new Date(task.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · {task.count} 张 · {task.quality} 高清 · {task.ratio}</small></span></button><button type="button" className="tryon-task-delete" aria-label={`删除任务 ${task.toolLabel}`} title="删除任务" onClick={(event) => { event.stopPropagation(); removeTask(task.taskId); }}><Trash2 size={13} /></button></div>)}
                    </div> : <div className="tryon-task-empty"><ListTodo size={24} /><strong>暂无生成任务</strong><p>生成后，任务进度和作品会显示在这里。</p></div>}
                </div>
            </AppDrawer>
            <AppDrawer open={promptLibraryOpen} onClose={() => setPromptLibraryOpen(false)} placement="right" size="min(360px, 100vw)" title={null} closable={false} flush rootClassName="tryon-prompt-drawer">
                <div className="tryon-prompt-panel">
                    <div className="tryon-prompt-panel-header"><div><BookOpen size={17} /><strong>我的提示词</strong></div><button type="button" aria-label="关闭提示词库" onClick={() => setPromptLibraryOpen(false)}><X size={19} /></button></div>
                    <div className="tryon-prompt-search">
                        <div className="tryon-prompt-search-input"><Search size={15} aria-hidden="true" /><input value={promptSearch} onChange={(event) => setPromptSearch(event.target.value)} placeholder="搜索我的提示词" /></div>
                        <button type="button" onClick={() => setPromptSearch((current) => current.trim())}>搜索</button>
                        <button type="button" onClick={() => openPromptCreate(false)}><Plus size={14} />新建提示词</button>
                    </div>
                    {savedPrompts.filter((prompt) => !promptSearch.trim() || `${prompt.title} ${prompt.content}`.toLowerCase().includes(promptSearch.trim().toLowerCase())).length > 0 ? (
                        <div className="tryon-prompt-list">{savedPrompts.filter((prompt) => !promptSearch.trim() || `${prompt.title} ${prompt.content}`.toLowerCase().includes(promptSearch.trim().toLowerCase())).map((prompt) => <button type="button" key={prompt.id} className="tryon-prompt-item" onClick={() => insertPromptContent(prompt.content)}><strong>{prompt.title}</strong><span>{prompt.content}</span></button>)}</div>
                    ) : (
                        <div className="tryon-prompt-empty"><span className="tryon-prompt-empty-icon"><BookOpen size={26} /></span><strong>{promptSearch.trim() ? "未找到相关提示词" : "暂无提示词"}</strong><p>{promptSearch.trim() ? "换个关键词试试，或新建一条提示词。" : "保存当前描述，或新建提示词以便复用。"}</p><button type="button" onClick={() => openPromptCreate(false)}><Plus size={14} />新建提示词</button></div>
                    )}
                    <div className="tryon-prompt-panel-footer"><button type="button" onClick={() => openPromptCreate(false)}><Plus size={14} />新建提示词</button></div>
                </div>
            </AppDrawer>
            <AppModal open={promptCreateOpen} onCancel={() => setPromptCreateOpen(false)} footer={null} closable={false} flush width="min(440px, calc(100vw - 32px))" className="tryon-prompt-modal">
                <div className="tryon-prompt-create">
                    <div className="tryon-prompt-create-header"><strong>新建提示词</strong><button type="button" aria-label="关闭新建提示词" onClick={() => setPromptCreateOpen(false)}><X size={19} /></button></div>
                    <div className="tryon-prompt-create-field"><label htmlFor="tryon-prompt-title">提示词标题</label><input id="tryon-prompt-title" maxLength={20} value={promptDraftTitle} onChange={(event) => setPromptDraftTitle(event.target.value)} placeholder="请输入提示词标题" /><span>{promptDraftTitle.length} / 20</span></div>
                    <div className="tryon-prompt-create-field"><label htmlFor="tryon-prompt-content">提示词内容（必填）</label><textarea id="tryon-prompt-content" maxLength={2000} value={promptDraftContent} onChange={(event) => setPromptDraftContent(event.target.value)} placeholder="请输入提示词内容" rows={6} /><span>{promptDraftContent.length} / 2000</span></div>
                    <div className="tryon-prompt-create-actions"><button type="button" onClick={() => setPromptCreateOpen(false)}>取消</button><button type="button" className="is-primary" onClick={submitPrompt}>提交</button></div>
                </div>
            </AppModal>
            <AssetLibraryPickerModal
                open={pickerTarget !== null}
                remoteLibrary
                remoteKind="image"
                mediaKinds={["image"]}
                items={pickerItems}
                categoryLabels={{ all: "全部图片" }}
                multiple={pickerTarget === "products" || pickerTarget === "accessory" || pickerTarget === "upper" || pickerTarget === "lower" || pickerTarget === "onepiece" || pickerTarget === "jewelry" || pickerTarget === "shoesBags"}
                title={pickerTarget === "model" ? `选择${activeTool.reference}` : pickerTarget === "accessory" ? `导入${accessoryLabel}商品图` : pickerTarget === "pair" || pickerTarget === "outer" || pickerTarget === "inner" ? `导入${shoeImageLabels[pickerTarget]}` : pickerTarget && pickerTarget !== "products" ? `导入${flatImageLabels[pickerTarget]}` : `导入${activeTool.input}`}
                emptyTitle="资产库里还没有图片"
                emptyDescription="先上传图片到资产库，或使用本页的本地上传。"
                onClose={() => setPickerTarget(null)}
                onConfirm={importAssets}
            />
            <AppModal open={modelPickerOpen} onCancel={() => setModelPickerOpen(false)} footer={null} closable={false} flush width="min(1060px, calc(100vw - 32px))" className="tryon-model-modal">
                <div className="tryon-model-dialog">
                    <div className="tryon-model-dialog-header"><div><strong>选择{activeTool.reference}</strong><span>为试穿画面挑选人物参考</span></div><button type="button" aria-label="关闭模特选择" onClick={() => setModelPickerOpen(false)}><X size={20} /></button></div>
                    <div className="tryon-model-dialog-tabs" role="tablist" aria-label="模特来源"><button type="button" role="tab" aria-selected={modelPickerTab === "recommended"} className={modelPickerTab === "recommended" ? "is-active" : ""} onClick={() => setModelPickerTab("recommended")}>境彻推荐</button><button type="button" role="tab" aria-selected={modelPickerTab === "mine"} className={modelPickerTab === "mine" ? "is-active" : ""} onClick={() => setModelPickerTab("mine")}>我的模特 {myModels.length > 0 && <span>{myModels.length}</span>}</button></div>
                    <div className="tryon-model-dialog-content" role="tabpanel">
                        {modelPickerTab === "recommended" ? <>
                            <div className="tryon-model-toolbar">
                                <div className="tryon-model-filters" role="group" aria-label="模特性别筛选">
                                    {([["all", "全部"], ["female", "女"], ["male", "男"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={modelGender === key} className={modelGender === key ? "is-active" : ""} onClick={() => setModelGender(key)}>{label}</button>)}
                                </div>
                                <p>内置示例模特 · 点击图片即可选择</p>
                            </div>
                            <div className="tryon-model-grid">{recommendedModels.filter((image) => modelGender === "all" || image.gender === modelGender).map((image) => <button type="button" key={image.url} className={modelImage?.url === image.url ? "is-selected" : ""} onClick={() => chooseModel(image)}><img src={image.url} alt={image.name} /><span>{image.name}</span>{modelImage?.url === image.url && <Check size={18} className="tryon-model-selected-icon" />}</button>)}<button type="button" className="tryon-model-create-card" onClick={() => setModelPickerTab("mine")}><span className="tryon-model-create-icon"><UserPlus size={22} /></span><strong>创建新模特</strong><span>上传本地图片或从资产库导入</span></button></div>
                        </> : <><div className="tryon-model-own-actions"><button type="button" onClick={() => modelInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) addOwnModel(file); }} onPaste={(event) => { const file = event.clipboardData.files[0]; if (file) addOwnModel(file); }}><UploadCloud size={17} />本地上传 / 拖入 / 粘贴</button><button type="button" onClick={() => { setModelPickerOpen(false); setPickerTarget("model"); }}><FolderOpen size={17} />从资产库导入</button></div><input ref={modelInput} className="tryon-visually-hidden" type="file" accept="image/*" aria-label="上传参考模特图" onChange={(event) => { const file = event.target.files?.[0]; if (file) addOwnModel(file); event.target.value = ""; }} />{myModels.length ? <div className="tryon-model-grid">{myModels.map((image) => <div className="tryon-model-card-wrap" key={image.url}><button type="button" aria-label="删除模特" title="删除模特" onClick={() => removeModel(image)}><X size={12} /></button><button type="button" className={modelImage?.url === image.url ? "is-selected" : ""} onClick={() => chooseModel(image)}><img src={image.url} alt={image.name} /><span>{image.name}</span>{modelImage?.url === image.url && <Check size={18} className="tryon-model-selected-icon" />}</button></div>)}</div> : <div className="tryon-model-empty"><ImagePlus size={28} /><strong>还没有添加模特图片</strong><span>上传本地图片，或从你的资产库选择。</span></div>}</>}
                    </div>
                    <div className="tryon-model-dialog-footer"><button type="button" className="tryon-model-create-primary" onClick={() => { if (modelPickerTab === "mine") { modelInput.current?.click(); } else { setModelPickerTab("mine"); } }}><UserPlus size={16} />创建新模特</button></div>
                </div>
            </AppModal>
            <AppModal open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} closable={false} flush width="calc(100vw - 32px)" className="tryon-preview-modal">
                {previewResult ? <div className="tryon-preview-shell">
                    <div className="tryon-preview-thumbs"><span>结果图 {previewIndex + 1}/{results.length}</span>{results.map((result, index) => <button key={result.id} type="button" aria-current={index === previewIndex} aria-label={`查看第 ${index + 1} 张结果图`} onClick={() => setPreviewIndex(index)}><img src={result.url} alt="" /></button>)}</div>
                    <div className="tryon-preview-stage"><div className="tryon-preview-stage-top">{feedbackButtons(previewResult.id, "tryon-preview-feedback")}</div><div className="tryon-preview-canvas"><img src={previewResult.url} alt={`${previewResult.toolLabel}结果放大图`} style={{ maxHeight: `${previewZoom}%` }} /></div><div className="tryon-preview-zoom"><button type="button" aria-label="缩小图片" onClick={() => setPreviewZoom(Math.max(60, previewZoom - 10))}><Minus size={16} /></button><span>{previewZoom}%</span><button type="button" aria-label="放大图片" onClick={() => setPreviewZoom(Math.min(150, previewZoom + 10))}><Plus size={16} /></button></div><div className="tryon-preview-bottom"><span>生成结果 · 已入库「我的资产」</span><div><button type="button" onClick={copyExampleConfig}>再次创作</button><a href={previewResult.url} download={`${previewResult.toolLabel}-${previewResult.id}.jpg`}><Download size={16} />下载图片</a></div></div></div>
                    <aside className="tryon-preview-info"><div className="tryon-preview-info-title"><strong><Shirt size={17} />{previewResult.toolLabel}</strong><button type="button" aria-label="关闭预览" onClick={() => setPreviewOpen(false)}><X size={19} /></button></div><dl><div><dt>生成模式</dt><dd>{fitMode === "professional" ? "专业模式" : "标准模式"}</dd></div><div><dt>生图比例</dt><dd>{previewResult.ratio}</dd></div><div><dt>清晰度</dt><dd>{previewResult.quality} 高清</dd></div><div><dt>生成时间</dt><dd>{new Date(previewResult.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</dd></div></dl><div className="tryon-preview-prompt"><strong>提示词</strong><p>{previewResult.prompt}</p></div></aside>
                </div> : null}
            </AppModal>
        </div>
    );
}
