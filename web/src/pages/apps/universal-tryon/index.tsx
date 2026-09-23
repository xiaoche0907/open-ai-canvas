import { useEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Coins, Download, FolderOpen, Footprints, Glasses, Heart, ImagePlus, ListTodo, LoaderCircle, Maximize2, Minus, Palette, PersonStanding, Plus, RotateCcw, ScanFace, Shirt, Sparkles, ThumbsDown, ThumbsUp, UploadCloud, X } from "lucide-react";

import { AssetLibraryPickerModal, type AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { AppDrawer } from "@/components/ui/product/app-drawer";
import { AppModal } from "@/components/ui/product/app-modal";
import { imageSizeForResolution, buildImageResolutionOptions } from "@/lib/image-resolution-tiers";
import { defaultImageCapabilityConfig, modelCapabilityConfigFor, normalizeImageValue } from "@/lib/model-capabilities";
import { modelQuoteRequest } from "@/lib/model-pricing";
import type { ModelRequirements } from "@/lib/model-selection";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { getRemoteAsset } from "@/services/api/user-data";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { modelOptionName, resolveModelChannel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
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
    { url: "/images/apps/tryon/model-female.png", name: "简约棚拍 · 女", local: false },
    { url: "/images/apps/tryon/model-male.png", name: "简约棚拍 · 男", local: false },
    { url: editorialExample, name: "都市街拍 · 女", local: false },
] satisfies PreviewImage[];

interface PreviewImage {
    url: string;
    name: string;
    local: boolean;
}

type FlatImageKind = "upper" | "lower" | "onepiece" | "jewelry" | "shoesBags";
type FlatImages = Record<FlatImageKind, PreviewImage[]>;
const flatImageLabels: Record<FlatImageKind, string> = {
    upper: "上装", lower: "下装", onepiece: "连体服装", jewelry: "首饰搭配", shoesBags: "鞋包搭配",
};
const emptyFlatImages = (): FlatImages => ({ upper: [], lower: [], onepiece: [], jewelry: [], shoesBags: [] });

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
    { label: "平铺/人台试衣", icon: PersonStanding, input: "平铺/人台图", reference: "参考模特", summary: "将平铺服装或人台照片转换为上身效果。" },
    { label: "鞋靴试穿", icon: Footprints, input: "鞋靴图", reference: "参考人物", summary: "上传鞋靴素材，预览自然的上脚画面。" },
    { label: "AI试戴", icon: Glasses, input: "配饰图", reference: "参考人物", summary: "为眼镜、帽饰和首饰寻找贴合的佩戴效果。" },
    { label: "AI换模特", icon: Sparkles, input: "原图", reference: "目标模特", summary: "保留商品特点，调整画面中的模特。" },
    { label: "模特换姿势", icon: PersonStanding, input: "原图", reference: "姿势参考", summary: "基于现有画面探索不同的人物姿态。" },
    { label: "AI换脸", icon: ScanFace, input: "原图", reference: "人脸参考", summary: "为现有画面选择新的面部参考。" },
    { label: "AI换色", icon: Palette, input: "原图", reference: "颜色参考", summary: "预览同一商品的不同颜色方案。" },
] as const;

function assetPreview(asset: ImageAsset): PreviewImage {
    const resourceId = resourceIdFromStorageKey(asset.data.storageKey);
    return { url: resourceId ? resourceFileUrl(resourceId) : asset.data.dataUrl || asset.coverUrl, name: asset.title, local: false };
}

export function UniversalTryonWorkspace({ onBack }: { onBack: () => void }) {
    const [activeToolIndex, setActiveToolIndex] = useState(0);
    const activeTool = tools[activeToolIndex];
    const [products, setProducts] = useState<PreviewImage[]>([]);
    const [flatMode, setFlatMode] = useState<"separates" | "onepiece">("separates");
    const [flatImages, setFlatImages] = useState<FlatImages>(emptyFlatImages);
    const [modelMode, setModelMode] = useState<"smart" | "reference">("smart");
    const [modelImage, setModelImage] = useState<PreviewImage | null>(null);
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const [modelPickerTab, setModelPickerTab] = useState<"recommended" | "mine">("recommended");
    const [myModels, setMyModels] = useState<PreviewImage[]>([]);
    const [consistentModel, setConsistentModel] = useState(false);
    const [description, setDescription] = useState("");
    const [fitMode, setFitMode] = useState<"standard" | "professional">("professional");
    const [quality, setQuality] = useState<"1K" | "2K" | "4K">("2K");
    const [ratio, setRatio] = useState<(typeof ratios)[number]>("自动比例");
    const [count, setCount] = useState(1);
    const [pickerTarget, setPickerTarget] = useState<"products" | "model" | FlatImageKind | null>(null);
    const [productError, setProductError] = useState("");
    const [mainTab, setMainTab] = useState<"results" | "examples">("examples");
    // 本页尚未接入生成任务，不能把内置演示图当作用户生成结果。
    const hasGeneratedResults = false;
    const [resultState, setResultState] = useState<"loading" | "complete">("complete");
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewZoom, setPreviewZoom] = useState(100);
    const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
    const [favorite, setFavorite] = useState(false);
    const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
    const productInput = useRef<HTMLInputElement>(null);
    const productDropzone = useRef<HTMLButtonElement>(null);
    const modelInput = useRef<HTMLInputElement>(null);
    const localUrls = useRef<string[]>([]);
    const assets = useAssetStore((state) => state.assets);
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
    const outfitCount = isFlatTryon ? flatMode === "separates" ? Math.min(flatImages.upper.length, flatImages.lower.length) : flatImages.onepiece.length : products.length;
    const outfitPreview = isFlatTryon ? (flatMode === "separates" ? flatImages.upper[0] || flatImages.lower[0] : flatImages.onepiece[0]) : products[0];
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
            input: { textCount: 1, imageCount: (isFlatTryon ? flatImageInputCount + flatImages.jewelry.length + flatImages.shoesBags.length : 1) + (modelMode === "reference" && modelImage ? 1 : 0), videoCount: 0, audioCount: 0, characterCount: 0 },
            imageSize: normalized.size,
            options: { size: normalized.size, quality: normalized.quality, count: 1 },
        };
        return modelQuoteRequest(quoteConfig, selectedModel, "image", requirements);
    }, [config, creditsEnabled, effectiveConfig, flatImageInputCount, flatImages.jewelry.length, flatImages.shoesBags.length, isFlatTryon, modelAvailable, modelImage, modelMode, outfitCount, quality, ratio, selectedModel]);
    const quoteKey = JSON.stringify(quoteRequest || null);
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

    const makePreview = (file: File): PreviewImage => {
        const url = URL.createObjectURL(file);
        localUrls.current.push(url);
        return { url, name: file.name, local: true };
    };

    const addProducts = (files: FileList | File[]) => {
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (images.length !== files.length) message.warning("仅支持上传图片文件");
        const available = Math.max(0, 10 - products.length);
        if (images.length > available) message.warning("产品图最多上传 10 张");
        if (images.length) setProductError("");
        setProducts([...products, ...images.slice(0, available).map(makePreview)]);
    };

    const addFlatImages = (kind: FlatImageKind, files: FileList | File[]) => {
        const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (images.length !== files.length) message.warning("仅支持上传图片文件");
        const available = Math.max(0, 10 - flatImages[kind].length);
        if (images.length > available) message.warning(`${flatImageLabels[kind]}最多上传 10 张`);
        if (images.length) setProductError("");
        const previews = images.slice(0, available).map(makePreview);
        setFlatImages((current) => ({ ...current, [kind]: [...current[kind], ...previews] }));
    };

    const removeFlatImage = (kind: FlatImageKind, index: number) => {
        const removed = flatImages[kind][index];
        if (removed?.local) URL.revokeObjectURL(removed.url);
        setFlatImages((current) => ({ ...current, [kind]: current[kind].filter((_, itemIndex) => itemIndex !== index) }));
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
        setProducts([]);
        setFlatImages(emptyFlatImages());
        setFlatMode("separates");
        setModelImage(null);
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
        if (modelInput.current) modelInput.current.value = "";
    };

    const showGenerateNotice = () => {
        if (isFlatTryon && !outfitCount) {
            setProductError(flatMode === "separates" ? "请先上传上装和下装图片" : "请先上传连体服装图片");
            return;
        }
        if (!isFlatTryon && !products.length) {
            setProductError(`请先上传${activeTool.input}${activeToolIndex === 0 ? "，或选择示例图片" : ""}`);
            productDropzone.current?.focus();
            return;
        }
        message.info(`${activeTool.label}生成能力正在接入，当前配置不会提交任务`);
    };

    const chooseModel = (image: PreviewImage) => {
        setModelImage(image);
        setModelMode("reference");
        setModelPickerOpen(false);
    };

    const addOwnModel = (file: File) => {
        if (!file.type.startsWith("image/")) { message.warning("请选择图片文件"); return; }
        const image = makePreview(file);
        setMyModels((current) => [image, ...current]);
        chooseModel(image);
    };

    const copyExampleConfig = () => {
        setPreviewOpen(false);
        reset();
        setActiveToolIndex(0);
        setProducts([{ url: outfitExample, name: "示例穿搭", local: false }]);
        setModelMode("reference");
        setModelImage({ url: editorialExample, name: "示例人物", local: false });
        setFitMode("standard");
        setQuality("2K");
        setRatio("2:3");
        setMainTab("examples");
        message.success("已填入示例配置，可继续调整");
    };

    const feedbackButtons = (className: string) => <div className={className} role="group" aria-label="示例效果反馈">
        <button type="button" aria-label="喜欢示例效果" aria-pressed={feedback === "up"} onClick={() => setFeedback(feedback === "up" ? null : "up")}><ThumbsUp size={15} /></button>
        <button type="button" aria-label="不喜欢示例效果" aria-pressed={feedback === "down"} onClick={() => setFeedback(feedback === "down" ? null : "down")}><ThumbsDown size={15} /></button>
    </div>;

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
                        {tools.map((tool, index) => <button key={tool.label} type="button" className={activeToolIndex === index ? "is-current" : ""} aria-current={activeToolIndex === index ? "page" : undefined} onClick={() => { if (activeToolIndex !== index) { reset(); setActiveToolIndex(index); } }}>
                            <tool.icon size={20} strokeWidth={1.7} aria-hidden="true" />
                            <span>{tool.label}</span>
                        </button>)}
                    </div>
                    <div className="tryon-tool-rail-bottom">{hasGeneratedResults && <button type="button" onClick={() => setMainTab("results")}><RotateCcw size={18} aria-hidden="true" /><span>生成结果</span></button>}<button type="button" onClick={() => setPickerTarget(isFlatTryon ? flatMode === "separates" ? "upper" : "onepiece" : "products")}><FolderOpen size={18} aria-hidden="true" /><span>资源仓库</span></button></div>
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
                        <div className="tryon-field-heading"><span>{activeTool.reference}</span><CircleHelp size={14} aria-label={`可智能匹配，也可上传${activeTool.reference}`} /></div>
                        <div className="tryon-reference-body">
                        <div className="tryon-mode-tabs" role="group" aria-label="模特方式">
                            <button type="button" aria-pressed={modelMode === "smart"} className={modelMode === "smart" ? "is-active" : ""} onClick={() => setModelMode("smart")}>智能模特</button>
                            <button type="button" aria-pressed={modelMode === "reference"} className={modelMode === "reference" ? "is-active" : ""} onClick={() => { setModelMode("reference"); setModelPickerOpen(true); }}>参考模特图</button>
                        </div>
                        {modelMode === "smart" ? (
                            <div className="tryon-smart-card"><span className="tryon-smart-icon"><Sparkles size={20} /></span><div><strong>一键生成匹配的模特图</strong><p>分析商品风格，自动匹配人物与场景。</p></div><Check size={16} className="tryon-smart-check" /></div>
                        ) : (
                            <div className="tryon-model-picker">
                                {modelImage ? <div className="tryon-selected-reference"><button type="button" className="tryon-selected-image" onClick={() => setModelPickerOpen(true)} aria-label="更换参考模特图"><img src={modelImage.url} alt={modelImage.name} /></button><div><strong>已选 1 张参考图</strong><span>{modelImage.name}</span><div><button type="button" onClick={() => setModelPickerOpen(true)}>编辑已选</button><button type="button" onClick={() => setModelImage(null)}>清空</button></div></div><button type="button" className="tryon-reference-chevron" aria-label="选择其他模特" onClick={() => setModelPickerOpen(true)}><ArrowRight size={16} /></button></div> : <button type="button" className="tryon-model-upload" onClick={() => setModelPickerOpen(true)}><ImagePlus size={20} /><span>选择{activeTool.reference}图片</span><ArrowRight size={16} /></button>}
                                <p className="tryon-field-tip">每张参考图独立处理，效果分开展示。</p>
                            </div>
                        )}
                        <div className="tryon-form-section tryon-description-section">
                            <div className="tryon-field-heading"><label htmlFor="tryon-description">额外描述 <span className="tryon-optional">选填</span></label><CircleHelp size={14} aria-label="可描述模特形象、姿态和场景" /></div>
                            <div className="tryon-textarea-wrap"><textarea id="tryon-description" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={modelMode === "smart" ? "模特：年轻女性，长发，自然站姿\n场景：都市街头，晴天\n风格：休闲通勤，简约时尚" : "描述参考模特的形象、姿态或场景。若希望保持原样，可写“保持背景与姿态不变”。"} rows={5} /><div><span>可补充画面细节</span><span>{description.length} / 2000 <button type="button" aria-label="清空额外描述" onClick={() => setDescription("")}><X size={13} /></button></span></div></div>
                        </div>
                        {modelMode === "smart" && <label className="tryon-consistent-row"><span>模特和场景一致 <CircleHelp size={13} aria-hidden="true" /></span><input type="checkbox" checked={consistentModel} onChange={(event) => setConsistentModel(event.target.checked)} /><span className="tryon-switch" aria-hidden="true" /></label>}
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
                        <div className="tryon-count-row"><span>{isFlatTryon ? "每套服装生成" : "每张素材生成"}</span><select id="tryon-count" value={count} onChange={(event) => setCount(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value} 张</option>)}</select><span>共 {outfitCount * count} 张</span></div>
                    </section>

                    <div className="tryon-sidebar-footer">
                        <div className="tryon-cost-preview" aria-live="polite">
                            <div><Coins size={15} aria-hidden="true" /><span>默认图片模型</span><strong title={selectedModel || undefined}>{selectedModel ? modelOptionName(selectedModel) : "未设置"}</strong></div>
                            <div><span>本次积分预估</span><strong>{!selectedModel ? "请先设置模型" : !modelAvailable ? "默认模型当前不可用" : !creditsEnabled || selectedChannel?.scope !== "system" ? "不使用系统积分" : !outfitCount ? "添加素材后显示" : !quoteRequest ? "当前规格无法报价" : totalCredits !== null ? `${totalCredits} 积分` : currentQuote?.error ? "报价暂不可用" : "正在报价…"}</strong></div>
                        </div>
                        <button type="button" className="tryon-generate-button" onClick={showGenerateNotice}><Sparkles size={17} />立即生成 <ArrowRight size={16} /></button>
                        <span>费用仅供预估，以实际任务计费为准 · 当前暂不提交生成任务</span>
                    </div>
                </aside>

                <main className="tryon-main">
                    <div className="tryon-main-tabs" role="tablist" aria-label="作品区域">{hasGeneratedResults && <button type="button" role="tab" aria-selected={mainTab === "results"} className={mainTab === "results" ? "is-active" : ""} onClick={() => setMainTab("results")}>生成结果</button>}<button type="button" role="tab" aria-selected={!hasGeneratedResults || mainTab === "examples"} className={!hasGeneratedResults || mainTab === "examples" ? "is-active" : ""} onClick={() => setMainTab("examples")}>做同款</button></div>
                    {hasGeneratedResults && mainTab === "results" && activeToolIndex !== 0 ? <div className="tryon-results" role="tabpanel"><div className="tryon-preview-empty"><span><activeTool.icon size={28} strokeWidth={1.5} /></span><h3>暂无{activeTool.label}结果</h3><p>可先在左侧配置素材。生成任务接入后，结果会显示在这里。</p></div></div> : hasGeneratedResults && mainTab === "results" ? <div className="tryon-results" role="tabpanel">
                        <div className="tryon-results-header"><div><span className="tryon-result-dot" /><strong>示例效果</strong><span>参考图片 · 内衣/童装模式 · 2K 高清 · 2:3</span></div><button type="button" className="tryon-reset-button" onClick={copyExampleConfig}>复制配置</button></div>
                        <div className="tryon-preview-switch" role="group" aria-label="示例状态"><span>界面预览</span><button type="button" aria-pressed={resultState === "loading"} onClick={() => setResultState("loading")}>生成中</button><button type="button" aria-pressed={resultState === "complete"} onClick={() => setResultState("complete")}>已完成</button></div>
                        {resultState === "loading" ? <div className="tryon-result-loading" role="status"><LoaderCircle size={24} aria-hidden="true" /><strong>生成中界面示例</strong><span>任务接入后将在此显示真实进度与结果</span></div> : <div className="tryon-result-card"><button type="button" className="tryon-result-image" aria-label="放大查看示例结果" onClick={() => { setPreviewZoom(100); setPreviewOpen(true); }}><img src={editorialExample} alt="万物上身完成效果示例" /></button>{feedbackButtons("tryon-result-feedback")}<div className="tryon-result-actions"><button type="button" aria-label="放大查看结果" onClick={() => { setPreviewZoom(100); setPreviewOpen(true); }}><Maximize2 size={16} /></button><button type="button" aria-label="收藏示例效果" aria-pressed={favorite} onClick={() => setFavorite(!favorite)}><Heart size={16} fill={favorite ? "currentColor" : "none"} /></button><a href={editorialExample} download="universal-tryon-example.jpg" aria-label="下载示例图片"><Download size={16} /></a></div></div>}
                        <p className="tryon-results-note">此处为界面演示，未创建生成任务，也不会扣除积分。</p>
                    </div> : <div className="tryon-main-inner" role="tabpanel">
                        <div className="tryon-intro"><span className="tryon-eyebrow">AI FASHION STUDIO</span><h2>{activeToolIndex === 0 ? "所见即所穿" : activeTool.label}</h2><p>{activeToolIndex === 0 ? "从商品素材到真实穿搭，预览每一种可能。" : activeTool.summary}</p></div>
                        {activeToolIndex === 0 ? <>
                        <div className="tryon-showcase" aria-label="万物上身示例流程">
                            <div className="tryon-showcase-topline"><span>创作预览</span><span className="tryon-demo-badge">示例演示</span></div>
                            <div className="tryon-showcase-grid">
                                <div className="tryon-showcase-panel"><div className="tryon-showcase-image is-product"><img src={products[0]?.url || outfitExample} alt="产品穿搭示例" /></div><span className="tryon-panel-index">01</span><strong>产品素材</strong></div>
                                <div className="tryon-flow-arrow"><Plus size={18} /></div>
                                <div className="tryon-showcase-panel"><div className="tryon-showcase-image"><img src={(modelMode === "reference" && modelImage?.url) || editorialExample} alt="参考模特示例" /></div><span className="tryon-panel-index">02</span><strong>{modelMode === "smart" ? "智能匹配模特" : "参考模特"}</strong></div>
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
                    <div className="tryon-task-panel-header"><div><ListTodo size={18} /><strong>任务列表</strong></div><div className="tryon-task-panel-actions"><button type="button" className="tryon-task-new" onClick={() => { reset(); setMainTab("examples"); setTaskDrawerOpen(false); }}><Plus size={14} />新建任务</button><button type="button" className="tryon-task-close" aria-label="关闭任务列表" onClick={() => setTaskDrawerOpen(false)}><X size={19} /></button></div></div>
                    <button type="button" className="tryon-task-draft" onClick={() => setTaskDrawerOpen(false)}><span className="tryon-task-thumb">{outfitPreview ? <img src={outfitPreview.url} alt="当前配置的服装素材" /> : <Shirt size={23} />}</span><span><strong>继续创建</strong><small>{outfitCount ? isFlatTryon ? `${activeTool.label} · 已选 ${outfitCount} 套服装` : `${activeTool.label} · 已选 ${outfitCount} 张${activeTool.input}` : `${activeTool.label} · 未开始`}</small></span><ArrowRight size={15} /></button>
                    <div className="tryon-task-divider"><span>最近 30 天 · 0 个生成任务</span></div>
                    <div className="tryon-task-empty"><ListTodo size={24} /><strong>暂无生成任务</strong><p>生成能力接入后，任务进度和作品会显示在这里。</p></div>
                </div>
            </AppDrawer>
            <AssetLibraryPickerModal
                open={pickerTarget !== null}
                remoteLibrary
                remoteKind="image"
                mediaKinds={["image"]}
                items={pickerItems}
                categoryLabels={{ all: "全部图片" }}
                multiple={pickerTarget !== "model"}
                title={pickerTarget === "model" ? `选择${activeTool.reference}` : pickerTarget && pickerTarget !== "products" ? `导入${flatImageLabels[pickerTarget]}` : `导入${activeTool.input}`}
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
                        {modelPickerTab === "recommended" ? <><p>内置示例模特 · 点击图片即可选择</p><div className="tryon-model-grid">{recommendedModels.map((image) => <button type="button" key={image.url} className={modelImage?.url === image.url ? "is-selected" : ""} onClick={() => chooseModel(image)}><img src={image.url} alt={image.name} /><span>{image.name}</span>{modelImage?.url === image.url && <Check size={18} className="tryon-model-selected-icon" />}</button>)}</div></> : <><div className="tryon-model-own-actions"><button type="button" onClick={() => modelInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) addOwnModel(file); }} onPaste={(event) => { const file = event.clipboardData.files[0]; if (file) addOwnModel(file); }}><UploadCloud size={17} />本地上传 / 拖入 / 粘贴</button><button type="button" onClick={() => { setModelPickerOpen(false); setPickerTarget("model"); }}><FolderOpen size={17} />从资产库导入</button></div><input ref={modelInput} className="tryon-visually-hidden" type="file" accept="image/*" aria-label="上传参考模特图" onChange={(event) => { const file = event.target.files?.[0]; if (file) addOwnModel(file); event.target.value = ""; }} />{myModels.length ? <div className="tryon-model-grid">{myModels.map((image) => <button type="button" key={image.url} className={modelImage?.url === image.url ? "is-selected" : ""} onClick={() => chooseModel(image)}><img src={image.url} alt={image.name} /><span>{image.name}</span>{modelImage?.url === image.url && <Check size={18} className="tryon-model-selected-icon" />}</button>)}</div> : <div className="tryon-model-empty"><ImagePlus size={28} /><strong>还没有添加模特图片</strong><span>上传本地图片，或从你的资产库选择。</span></div>}</>}
                    </div>
                </div>
            </AppModal>
            <AppModal open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} closable={false} flush width="calc(100vw - 32px)" className="tryon-preview-modal">
                <div className="tryon-preview-shell">
                    <div className="tryon-preview-thumbs"><span>结果图 1/1</span><button type="button" aria-current="true" aria-label="查看第 1 张结果图"><img src={editorialExample} alt="" /></button></div>
                    <div className="tryon-preview-stage"><div className="tryon-preview-stage-top">{feedbackButtons("tryon-preview-feedback")}</div><div className="tryon-preview-canvas"><img src={editorialExample} alt="万物上身示例结果放大图" style={{ maxHeight: `${previewZoom}%` }} /></div><div className="tryon-preview-zoom"><button type="button" aria-label="缩小图片" onClick={() => setPreviewZoom(Math.max(60, previewZoom - 10))}><Minus size={16} /></button><span>{previewZoom}%</span><button type="button" aria-label="放大图片" onClick={() => setPreviewZoom(Math.min(150, previewZoom + 10))}><Plus size={16} /></button></div><div className="tryon-preview-bottom"><span>示例图片，仅用于预览界面</span><div><button type="button" onClick={copyExampleConfig}>再次创作</button><a href={editorialExample} download="universal-tryon-example.jpg"><Download size={16} />下载示例图</a></div></div></div>
                    <aside className="tryon-preview-info"><div className="tryon-preview-info-title"><strong><Shirt size={17} />万物上身</strong><button type="button" aria-label="关闭预览" onClick={() => setPreviewOpen(false)}><X size={19} /></button></div><span className="tryon-demo-badge">示例效果 · 非真实任务</span><dl><div><dt>生成模式</dt><dd>内衣/童装模式</dd></div><div><dt>生图比例</dt><dd>2:3</dd></div><div><dt>清晰度</dt><dd>2K 高清</dd></div></dl><div className="tryon-preview-source"><strong>产品图</strong><img src={outfitExample} alt="示例产品穿搭" /></div><div className="tryon-preview-source"><strong>参考模特图</strong><img src={editorialExample} alt="示例参考人物" /></div></aside>
                </div>
            </AppModal>
        </div>
    );
}
