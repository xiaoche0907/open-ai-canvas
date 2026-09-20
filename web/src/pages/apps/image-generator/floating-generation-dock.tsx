import { useRef, type ChangeEvent, type CSSProperties, type DragEvent } from "react";
import { Button, Image, Spin } from "antd";
import {
    Plus,
    X,
    Image as ImageIcon,
    Bot,
    ArrowRight,
    Coins,
} from "lucide-react";
import type { AiConfig } from "@/stores/use-config-store";
import { ModelPicker } from "@/components/model-picker";
import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";
import { GenerationSettingsMenu } from "./generation-settings-menu";
import type {
    ImageGenParams,
    UploadedReferenceImage,
} from "./types";
import { MAX_REFERENCE_IMAGES } from "./types";

interface FloatingGenerationDockProps {
    config: AiConfig;
    prompt: string;
    onChangePrompt: (val: string) => void;
    referenceImages: UploadedReferenceImage[];
    onUploadReference: (files: File[]) => void;
    onRemoveReference: (id: string) => void;
    uploadingRef: boolean;
    params: ImageGenParams;
    onChangeParams: (patch: Partial<ImageGenParams>) => void;
    selectedModel: string;
    onChangeModel: (model: string) => void;
    creditCost?: string;
    isGenerating: boolean;
    onGenerate: () => void;
    isWorkspace?: boolean;
    mode?: "image" | "agent";
    agentPreparing?: boolean;
    onChangeMode?: (mode: "image" | "agent") => void;
}

export function FloatingGenerationDock({
    config,
    prompt,
    onChangePrompt,
    referenceImages,
    onUploadReference,
    onRemoveReference,
    uploadingRef,
    params,
    onChangeParams,
    selectedModel,
    onChangeModel,
    creditCost,
    isGenerating,
    onGenerate,
    isWorkspace = false,
    mode = "image",
    agentPreparing = false,
    onChangeMode,
}: FloatingGenerationDockProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length) {
            onUploadReference(files);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (uploadingRef || referenceImages.length >= MAX_REFERENCE_IMAGES) return;
        const files = Array.from(e.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
        if (files.length) {
            onUploadReference(files);
        }
    };

    const firstRef = referenceImages[0];
    const canAddReference = referenceImages.length < MAX_REFERENCE_IMAGES;
    const openFilePicker = () => {
        if (!uploadingRef && canAddReference) fileInputRef.current?.click();
    };

    return (
        <div className={`image-gen-dock-wrapper ${isWorkspace ? "is-workspace" : ""}`}>
            <div className="image-gen-dock-card creation-chat-composer app-user-workspace">
                {/* 顶部模式切换栏 */}
                <div className="image-gen-dock-modes">
                    <button type="button" className={`image-gen-mode-btn ${mode === "image" ? "is-active" : ""}`} onClick={() => onChangeMode?.("image")}>
                        <ImageIcon className="size-3.5" />
                        <span>图片</span>
                    </button>
                    <button
                        type="button"
                        className={`image-gen-mode-btn ${mode === "agent" ? "is-active" : ""}`}
                        title="使用画布 Agent 创作图片"
                        disabled={agentPreparing}
                        onClick={() => onChangeMode?.("agent")}
                    >
                        {agentPreparing ? <Spin size="small" /> : <Bot className="size-3.5" />}
                        <span>{agentPreparing ? "正在进入" : "Agent"}</span>
                    </button>
                </div>

                {/* 主输入区 */}
                <div className="image-gen-dock-body">
                    {/* 参考图插槽 */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: "none" }}
                        onChange={handleFileChange}
                    />
                    <div
                        className="image-gen-ref-picker"
                        title={canAddReference ? `点击或拖拽上传参考图，最多 ${MAX_REFERENCE_IMAGES} 张` : `已达到 ${MAX_REFERENCE_IMAGES} 张上限`}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        <Image.PreviewGroup>
                            {referenceImages.map((reference, index) => (
                                <div
                                    key={reference.id}
                                    className={`image-gen-ref-card ${index % 2 ? "is-odd" : "is-even"}`}
                                    style={{ "--image-gen-ref-index": index } as CSSProperties}
                                >
                                    <Image
                                        src={reference.url}
                                        alt={reference.name}
                                        rootClassName="image-gen-ref-image"
                                        className="image-gen-ref-preview"
                                        preview={{ mask: false }}
                                    />
                                    <button
                                        type="button"
                                        className="image-gen-ref-remove"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveReference(reference.id);
                                        }}
                                        title={`移除 ${reference.name}`}
                                        aria-label={`移除参考图 ${reference.name}`}
                                    >
                                        <X className="size-2.5" />
                                    </button>
                                </div>
                            ))}
                        </Image.PreviewGroup>
                        {canAddReference && (
                            <button
                                type="button"
                                className="image-gen-ref-card is-add"
                                style={{ "--image-gen-ref-index": referenceImages.length } as CSSProperties}
                                disabled={uploadingRef}
                                onClick={openFilePicker}
                                aria-label={`添加参考图，当前 ${referenceImages.length} 张，最多 ${MAX_REFERENCE_IMAGES} 张`}
                            >
                                {uploadingRef ? (
                                    <Spin size="small" />
                                ) : (
                                    <div className="image-gen-ref-empty">
                                        <Plus className="size-4 opacity-70" />
                                        <span>{referenceImages.length ? "继续添加" : "参考图"}</span>
                                    </div>
                                )}
                            </button>
                        )}
                        {referenceImages.length > 0 && (
                            <span className="image-gen-ref-count">{referenceImages.length}/{MAX_REFERENCE_IMAGES}</span>
                        )}
                    </div>

                    {/* 提示词输入框 */}
                    <div className="image-gen-prompt-input-wrap">
                        <textarea
                            className="image-gen-prompt-textarea"
                            placeholder="输入提示词描述画面主体、场景光影、构图与艺术风格（按 Ctrl+Enter 快速生成）..."
                            value={prompt}
                            rows={3}
                            onChange={(e) => onChangePrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    onGenerate();
                                }
                            }}
                        />
                    </div>
                </div>

                {/* 底部参数与控制行 */}
                <div className="image-gen-dock-footer creation-chat-dock">
                    <div className="image-gen-dock-controls-left creation-chat-controls">
                        {/* 语音输入按钮（与首页一致） */}
                        <VoiceRecordingButton
                            className="creation-voice-trigger"
                            disabled={isGenerating}
                            onTranscribed={(text) => onChangePrompt(prompt.trim() ? `${prompt} ${text}` : text)}
                        />

                        {/* 模型选择器（与首页完全一致的 ModelPicker variant="creation"） */}
                        <ModelPicker
                            config={config}
                            value={selectedModel}
                            onChange={onChangeModel}
                            capability="image"
                            className="creation-model-picker"
                            placeholder="选择图片模型"
                            showSelectedPrice={false}
                            showOptionPrices
                            variant="creation"
                        />

                        {/* 比例与画质参数控制（与首页完全一致的 GenerationSettingsMenu） */}
                        <GenerationSettingsMenu
                            config={config}
                            selectedModel={selectedModel}
                            ratio={params.ratio}
                            onChangeRatio={(ratio) => onChangeParams({ ratio })}
                            quality={params.quality}
                            onChangeQuality={(quality) => onChangeParams({ quality })}
                            count={String(params.count)}
                            onChangeCount={(count) => onChangeParams({ count })}
                            referenceImageSize={firstRef?.width && firstRef?.height ? { width: firstRef.width, height: firstRef.height } : undefined}
                        />
                    </div>

                    <div className="image-gen-dock-controls-right">
                        {creditCost !== undefined && (
                            <div className="image-gen-credit-badge">
                                <Coins className="size-3.5 opacity-80" />
                                <span>{creditCost} 积分</span>
                            </div>
                        )}

                        <Button
                            type="primary"
                            className="image-gen-submit-btn"
                            disabled={!prompt.trim() || isGenerating}
                            loading={isGenerating}
                            onClick={onGenerate}
                            icon={!isGenerating ? <ArrowRight className="size-3.5" /> : undefined}
                        >
                            {isGenerating ? "生成中" : "开始生成"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
