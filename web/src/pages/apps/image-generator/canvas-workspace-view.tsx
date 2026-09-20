import { useState, type CSSProperties, type ReactNode } from "react";
import { Dropdown, Slider } from "antd";
import { AssetLibraryCard } from "@/components/assets/asset-library-card";
import { AppModal } from "@/components/ui/product/app-modal";
import {
    ChevronLeft,
    Folder,
    Edit3,
    Sparkles,
    ZoomIn,
    ZoomOut,
    Download,
    Eye,
    Check,
    Palette,
    Layers,
    Filter,
    ChevronDown,
    Bot,
    Image as ImageIcon,
} from "lucide-react";
import { downloadMediaFile } from "@/lib/media-download";
import { ImageGenProjectSidebar } from "./project-sidebar";
import type { GeneratedImageItem, ImageGenProject } from "./types";

function formatImageBytes(bytes?: number) {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CanvasWorkspaceViewProps {
    title: string;
    onChangeTitle: (val: string) => void;
    onBackToApps: () => void;
    onToggleDiscovery: () => void;
    projects: ImageGenProject[];
    activeProjectId: string;
    projectSidebarCollapsed: boolean;
    onChangeProjectSidebarCollapsed: (collapsed: boolean) => void;
    onCreateProject: () => void;
    onSelectProject: (project: ImageGenProject) => void;
    onRenameProject: (id: string, title: string) => void;
    onDeleteProject: (id: string) => void;
    onTogglePinProject: (id: string) => void;
    currentResults: GeneratedImageItem[];
    isGenerating: boolean;
    generationStage?: string;
    generationRatio?: string;
    onSendToCanvas: (item: GeneratedImageItem) => void;
    generationMode: "image" | "agent";
    agentPreparing?: boolean;
    onChangeGenerationMode: (mode: "image" | "agent") => void;
    children: ReactNode; // 底部浮动坞
}

export function CanvasWorkspaceView({
    title,
    onChangeTitle,
    onBackToApps,
    onToggleDiscovery,
    projects,
    activeProjectId,
    projectSidebarCollapsed,
    onChangeProjectSidebarCollapsed,
    onCreateProject,
    onSelectProject,
    onRenameProject,
    onDeleteProject,
    onTogglePinProject,
    currentResults,
    isGenerating,
    generationStage = "正在深度构图并生成商业级画面...",
    generationRatio = "1:1",
    onSendToCanvas,
    generationMode,
    agentPreparing = false,
    onChangeGenerationMode,
    children,
}: CanvasWorkspaceViewProps) {
    const [zoom, setZoom] = useState(70);
    const [category, setCategory] = useState<"all" | "image">("all");
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const ratioMatch = generationRatio.match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
    const loadingAspectRatio = ratioMatch ? `${ratioMatch[1]} / ${ratioMatch[2]}` : "1 / 1";
    const galleryStyle = {
        "--image-gen-card-width": `${Math.round(280 * zoom / 100)}px`,
    } as CSSProperties;

    const handleDownload = (img: GeneratedImageItem) => {
        const safeTitle = (title.trim() || "ai-image-gen").replace(/[\\/:*?"<>|]/g, "_");
        void downloadMediaFile(img.url, `${safeTitle}.png`);
    };

    return (
        <div className="image-gen-workspace-root">
            <ImageGenProjectSidebar
                projects={projects}
                activeProjectId={activeProjectId}
                collapsed={projectSidebarCollapsed}
                onChangeCollapsed={onChangeProjectSidebarCollapsed}
                onOpenCreation={onToggleDiscovery}
                onCreateProject={onCreateProject}
                onSelectProject={onSelectProject}
                onRenameProject={onRenameProject}
                onDeleteProject={onDeleteProject}
                onTogglePinProject={onTogglePinProject}
            />

            <div className="image-gen-workspace-main">
            {/* 顶栏控制栏 (图2结构) */}
            <header className="image-gen-topbar">
                <div className="image-gen-topbar-left">
                    <button
                        type="button"
                        className="image-gen-back-btn"
                        onClick={onBackToApps}
                        title="返回应用列表"
                    >
                        <ChevronLeft className="size-4" />
                        <span>AI应用</span>
                    </button>

                    <div className="image-gen-topbar-divider" />

                    {/* 任务标题（支持单击或铅笔编辑） */}
                    <div className="image-gen-task-title-wrap">
                        <Folder className="size-4 opacity-70" />
                        {isEditingTitle ? (
                            <input
                                autoFocus
                                className="image-gen-title-input"
                                value={title}
                                onChange={(e) => onChangeTitle(e.target.value)}
                                onBlur={() => setIsEditingTitle(false)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") setIsEditingTitle(false);
                                }}
                            />
                        ) : (
                            <span
                                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                                onClick={() => setIsEditingTitle(true)}
                                title="点击修改任务标题"
                            >
                                <span>{title || "图像生成"}</span>
                                <Edit3 className="size-3 opacity-40 hover:opacity-100" />
                            </span>
                        )}
                    </div>

                    {/* 灵感发现切换按钮 */}
                    <button
                        type="button"
                        className="image-gen-pill-btn"
                        onClick={onToggleDiscovery}
                        title="查看首页精选灵感"
                    >
                        <Sparkles className="size-3.5" />
                        <span>灵感发现</span>
                    </button>

                    <div className="image-gen-workspace-modes" aria-label="创作模式">
                        <button type="button" className={generationMode === "image" ? "is-active" : ""} onClick={() => onChangeGenerationMode("image")}>
                            <ImageIcon className="size-3.5" />
                            <span>图片</span>
                        </button>
                        <button type="button" className={generationMode === "agent" ? "is-active" : ""} disabled={agentPreparing} onClick={() => onChangeGenerationMode("agent")}>
                            <Bot className="size-3.5" />
                            <span>{agentPreparing ? "正在进入" : "Agent"}</span>
                        </button>
                    </div>
                </div>

                <div className="image-gen-topbar-right">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            selectedKeys: [category],
                            onClick: ({ key }) => setCategory(key as "all" | "image"),
                            items: [
                                { key: "all", label: "全部" },
                                { key: "image", label: "图片创作" },
                            ],
                        }}
                    >
                        <button type="button" className="image-gen-filter-btn" aria-label="筛选创作类型">
                            <span>{category === "all" ? "全部" : "图片创作"}</span>
                            <Filter className="size-3.5" />
                            <ChevronDown className="size-3.5 opacity-60" />
                        </button>
                    </Dropdown>

                    {/* 缩放控制器 */}
                    <div className="image-gen-zoom-control">
                        <ZoomOut
                            className="size-3.5 opacity-60 cursor-pointer hover:opacity-100"
                            onClick={() => setZoom((z) => Math.max(50, z - 10))}
                        />
                        <Slider
                            min={50}
                            max={150}
                            value={zoom}
                            onChange={(val) => setZoom(val)}
                            style={{ width: 80, margin: "0 4px" }}
                            tooltip={{ formatter: (val) => `${val}%` }}
                        />
                        <ZoomIn
                            className="size-3.5 opacity-60 cursor-pointer hover:opacity-100"
                            onClick={() => setZoom((z) => Math.min(150, z + 10))}
                        />
                        <span className="image-gen-zoom-label">{zoom}%</span>
                    </div>
                </div>
            </header>

            {/* 主画布展示区域 */}
            <main className="image-gen-canvas-stage">
                {isGenerating || currentResults.length > 0 ? (
                    <div className="image-gen-results-grid" style={galleryStyle}>
                        {currentResults.map((item, index) => (
                            <AssetLibraryCard className="image-gen-result-card" key={item.id}>
                                <div
                                    className="library-card-media image-gen-result-media"
                                    style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : "1 / 1" }}
                                >
                                    <button
                                        type="button"
                                        className="image-gen-result-open"
                                        onClick={() => setPreviewUrl(item.url)}
                                        aria-label={`放大查看第 ${index + 1} 张生成图片`}
                                    >
                                        <img
                                            src={item.url}
                                            alt={`${title || "图像生成"} ${index + 1}`}
                                            className="image-gen-result-img"
                                        />
                                    </button>
                                    <div className="image-gen-result-badges" aria-hidden="true">
                                        <span>图片</span>
                                        <span>生成结果</span>
                                    </div>

                                    <div className="image-gen-card-actions-bar">
                                        <button type="button" className="image-gen-action-btn" onClick={() => setPreviewUrl(item.url)} title="放大查看高清原图" aria-label="放大查看高清原图">
                                            <Eye className="size-4" />
                                        </button>
                                        <button type="button" className="image-gen-action-btn" onClick={() => handleDownload(item)} title="无损下载至本地" aria-label="无损下载至本地">
                                            <Download className="size-4" />
                                        </button>
                                        <button type="button" className="image-gen-action-btn" onClick={() => onSendToCanvas(item)} title="发送到自由画布" aria-label="发送到自由画布">
                                            <Palette className="size-4" />
                                        </button>
                                        <span className="image-gen-asset-check" title="已存入我的资产">
                                            <Check className="size-4" />
                                        </span>
                                    </div>
                                </div>

                                <button type="button" className="image-gen-result-info" onClick={() => setPreviewUrl(item.url)}>
                                    <span className="image-gen-result-info-title">
                                        <strong title={item.prompt || title}>{item.prompt || title || "图像生成"}</strong>
                                        <time>{new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}</time>
                                    </span>
                                    <span className="image-gen-result-summary">
                                        {item.width || 1024}×{item.height || 1024}{formatImageBytes(item.bytes) ? ` · ${formatImageBytes(item.bytes)}` : ""} · {item.mimeType || "image/png"}
                                    </span>
                                    <span className="image-gen-result-source">AI 图像生成 · {item.model?.split("/").pop() || "当前模型"}</span>
                                </button>
                            </AssetLibraryCard>
                        ))}

                        {isGenerating && (
                            <div className="image-gen-loading-state" style={{ aspectRatio: loadingAspectRatio }}>
                                <div className="image-gen-pulsing-orbit">
                                    <span className="image-gen-pulse-ring" />
                                    <Sparkles className="size-5 animate-pulse" />
                                </div>
                                <div className="image-gen-loading-title">AI 正在渲染生成</div>
                                <div className="image-gen-loading-copy">{generationStage}</div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="image-gen-empty-state">
                        <Layers className="size-12 opacity-30" />
                        <div style={{ fontSize: 14 }}>在下方输入提示词，点击「开始生成」开启创作</div>
                    </div>
                )}
            </main>

            {/* 底部常驻浮动坞 */}
            {children}
            </div>

            {/* 高清大图预览弹窗 */}
            <AppModal
                open={Boolean(previewUrl)}
                onCancel={() => setPreviewUrl(null)}
                footer={null}
                centered
                flush
                width="80vw"
            >
                {previewUrl && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh", padding: 12, background: "var(--card)", borderRadius: "var(--r-xl, 14px)", overflow: "hidden" }}>
                        <img
                            src={previewUrl}
                            alt="高清预览"
                            style={{ maxWidth: "100%", maxHeight: "76vh", objectFit: "contain", borderRadius: 8 }}
                        />
                    </div>
                )}
            </AppModal>
        </div>
    );
}
