import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import { ArrowUp, Blocks, ChevronRight, Image as ImageIcon, LoaderCircle, Paperclip, Plus, Shapes } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";
import type { ImageAsset } from "@/stores/use-asset-store";
import type { SkillReference } from "./SkillContextChips";
import { SkillComposerEditor } from "./SkillComposerEditor";

type Props = {
    message: string;
    onMessageChange: (message: string) => void;
    onSend: () => void;
    busy?: boolean;
    selectedSkills: SkillReference[];
    onRemoveSkill: (id: string) => void;
    composerRef?: RefObject<HTMLDivElement | null>;
    config: AiConfig;
    selectedModel: string;
    onModelChange: (model: string) => void;
    selectedImages: ImageAsset[];
    onRemoveImage: (id: string) => void;
    onOpenAssetLibrary: () => void;
    onOpenSkills: () => void;
    onOpenMaterials: () => void;
    onImageFilesDrop: (files: File[]) => void;
};

export function PromptComposer({ message, onMessageChange, onSend, busy = false, selectedSkills, onRemoveSkill, composerRef, config, selectedModel, onModelChange, selectedImages, onRemoveImage, onOpenAssetLibrary, onOpenSkills, onOpenMaterials, onImageFilesDrop }: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [draggingImages, setDraggingImages] = useState(false);
    const dragDepth = useRef(0);
    const menuRef = useRef<HTMLDivElement>(null);
    const canSend = message.trim().length > 0;

    useEffect(() => {
        if (!menuOpen) return;
        const closeOutside = (event: PointerEvent) => {
            if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
        };
        const closeEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("pointerdown", closeOutside);
        document.addEventListener("keydown", closeEscape);
        return () => {
            document.removeEventListener("pointerdown", closeOutside);
            document.removeEventListener("keydown", closeEscape);
        };
    }, [menuOpen]);

    const choose = (action: () => void) => {
        setMenuOpen(false);
        action();
    };

    const hasDraggedFiles = (event: DragEvent<HTMLDivElement>) => Array.from(event.dataTransfer.types).includes("Files");
    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        if (!hasDraggedFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDraggingImages(false);
        onImageFilesDrop(Array.from(event.dataTransfer.files));
    };

    return (
        <div ref={composerRef} className="se-prompt-box" onDragEnter={(event) => { if (!hasDraggedFiles(event)) return; event.preventDefault(); dragDepth.current += 1; setDraggingImages(true); }} onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDraggingImages(false); }} onDragOver={(event) => { if (hasDraggedFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={handleDrop}>
            {draggingImages ? <div className="se-prompt-drop-overlay" aria-hidden="true">松开即可添加图片</div> : null}
            <div className="se-prompt-line">
                <SkillComposerEditor message={message} onMessageChange={onMessageChange} selectedSkills={selectedSkills} selectedImages={selectedImages} onRemoveSkill={onRemoveSkill} onRemoveImage={onRemoveImage} onSend={onSend} />
            </div>
            <div className="se-prompt-toolbar">
                <div className="se-prompt-add-wrap" ref={menuRef}>
                    <button type="button" className="se-prompt-icon-btn" aria-label="添加内容" aria-expanded={menuOpen} aria-haspopup="menu" title="添加内容" onClick={() => setMenuOpen((open) => !open)}>
                        <Plus size={17} />
                    </button>
                    {menuOpen ? <div className="se-prompt-add-menu" role="menu" aria-label="添加到对话">
                        <button type="button" role="menuitem" onClick={() => choose(onOpenAssetLibrary)}><Paperclip size={16} /><span>上传文件</span></button>
                        <button type="button" role="menuitem" onClick={() => choose(onOpenSkills)}><Blocks size={16} /><span>Skill</span><ChevronRight size={14} /></button>
                        <button type="button" role="menuitem" disabled title="连接器即将开放"><Shapes size={16} /><span>连接器</span><ChevronRight size={14} /></button>
                        <button type="button" role="menuitem" onClick={() => choose(onOpenMaterials)}><ImageIcon size={16} /><span>添加素材</span></button>
                    </div> : null}
                </div>
                <div className="se-prompt-toolbar-right">
                    <ModelPicker config={config} value={selectedModel} capability="text" onChange={onModelChange} variant="creation" showSelectedPrice={false} showOptionPrices className="se-prompt-model-picker" placeholder="选择文本模型" />
                    <button type="button" className={cn("se-prompt-send", canSend && "is-ready")} aria-label={busy ? "正在启动 Agent" : "发送"} disabled={!canSend || busy} onClick={onSend}>
                        {busy ? <LoaderCircle size={17} className="se-spin" /> : <ArrowUp size={17} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
