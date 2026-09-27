import { useEffect, useRef } from "react";
import { Extension, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image as ImageIcon, Sparkles, X } from "lucide-react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import type { ImageAsset } from "@/stores/use-asset-store";
import type { SkillReference } from "./SkillContextChips";

type Props = {
    message: string;
    selectedSkills: SkillReference[];
    selectedImages: ImageAsset[];
    onMessageChange: (message: string) => void;
    onRemoveSkill: (id: string) => void;
    onRemoveImage: (id: string) => void;
    onSend: () => void;
};

function ContextChipView({ node, editor, getPos, deleteNode, selected }: NodeViewProps) {
    const { kind, id, name, coverUrl, storageKey, width, height } = node.attrs;
    const scale = width && height ? Math.min(144 / width, 144 / height) : 1;
    return (
        <NodeViewWrapper
            as="span"
            className={`${kind === "image" ? "se-prompt-asset" : "se-prompt-chip"} se-composer-chip${selected ? " is-selected" : ""}`}
            data-composer-chip-id={`${kind}:${id}`}
            onClick={() => { const position = getPos(); if (typeof position === "number") editor.chain().focus().setNodeSelection(position).run(); }}
        >
            {kind === "image" ? <CachedResourceImage className="se-prompt-asset-preview" src={coverUrl} storageKey={storageKey} alt="" width={16} height={16} draggable={false} fallback={<ImageIcon size={13} aria-hidden="true" />} /> : <Sparkles size={12} strokeWidth={1.8} aria-hidden="true" />}
            <span className={kind === "image" ? "se-prompt-asset-name" : "se-prompt-chip-name"}>{name}</span>
            <button type="button" className="se-prompt-chip-remove" aria-label={`移除${kind === "image" ? "图片" : "技能"} ${name}`} onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.stopPropagation(); deleteNode(); }}><X size={12} aria-hidden="true" /></button>
            {kind === "image" ? <span className="se-prompt-asset-hover" style={width && height ? { width: Math.round(width * scale), height: Math.round(height * scale) } : undefined} aria-hidden="true"><CachedResourceImage eager className="se-prompt-asset-hover-image" src={coverUrl} storageKey={storageKey} alt="" draggable={false} fallback={<ImageIcon size={24} aria-hidden="true" />} /></span> : null}
        </NodeViewWrapper>
    );
}

const ContextChip = Node.create({
    name: "skillComposerChip",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
        return {
            kind: { default: "skill" }, id: { default: "" }, name: { default: "" },
            coverUrl: { default: "" }, storageKey: { default: "" }, width: { default: 0 }, height: { default: 0 },
        };
    },
    parseHTML() { return [{ tag: "span[data-skill-composer-chip]" }]; },
    renderHTML({ HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes, { "data-skill-composer-chip": "" })]; },
    addNodeView() { return ReactNodeViewRenderer(ContextChipView); },
});

const ComposerPlaceholder = Extension.create({
    name: "skillComposerPlaceholder",
    addProseMirrorPlugins() {
        return [new Plugin({
            props: {
                decorations(state) {
                    const paragraph = state.doc.firstChild;
                    if (!paragraph || paragraph.type.name !== "paragraph") return null;
                    let hasContent = false;
                    let hasChip = false;
                    paragraph.descendants((node) => {
                        if (node.isText || node.type.name === "hardBreak") hasContent = true;
                        if (node.type.name === "skillComposerChip") hasChip = true;
                    });
                    if (hasContent) return null;
                    return DecorationSet.create(state.doc, [Decoration.widget(1 + paragraph.content.size, () => {
                        const placeholder = document.createElement("span");
                        placeholder.className = "se-composer-placeholder";
                        placeholder.textContent = hasChip ? "补充你的设计想法…" : "让 境彻 帮你设计一张美丽的婚礼海报";
                        placeholder.contentEditable = "false";
                        placeholder.setAttribute("aria-hidden", "true");
                        return placeholder;
                    }, { side: 1 })]);
                },
            },
        })];
    },
});

function chipContent(skills: SkillReference[], images: ImageAsset[]): JSONContent[] {
    return [
        ...images.map((asset) => ({ type: "skillComposerChip", attrs: { kind: "image", id: asset.id, name: asset.title || "图片", coverUrl: asset.coverUrl, storageKey: asset.data.storageKey || "", width: asset.data.width || 0, height: asset.data.height || 0 } })),
        ...skills.map((skill) => ({ type: "skillComposerChip", attrs: { kind: "skill", id: skill.id, name: skill.name } })),
    ];
}

function composerDocument(message: string, skills: SkillReference[], images: ImageAsset[]): JSONContent {
    const lines = message.split("\n");
    const text = lines.flatMap((line, index): JSONContent[] => [...(index ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])]);
    return { type: "doc", content: [{ type: "paragraph", content: [...chipContent(skills, images), ...text] }] };
}

function readComposerDocument(editor: ReturnType<typeof useEditor>) {
    const chips: string[] = [];
    let message = "";
    editor?.state.doc.forEach((paragraph, _offset, index) => {
        if (index) message += "\n";
        paragraph.descendants((node) => {
            if (node.type.name === "skillComposerChip") chips.push(`${node.attrs.kind}:${node.attrs.id}`);
            else if (node.isText) message += node.text || "";
            else if (node.type.name === "hardBreak") message += "\n";
        });
    });
    return { chips, message };
}

export function SkillComposerEditor({ message, selectedSkills, selectedImages, onMessageChange, onRemoveSkill, onRemoveImage, onSend }: Props) {
    const callbacks = useRef({ onMessageChange, onRemoveSkill, onRemoveImage, onSend, selectedSkills, selectedImages });
    callbacks.current = { onMessageChange, onRemoveSkill, onRemoveImage, onSend, selectedSkills, selectedImages };

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [StarterKit, ContextChip, ComposerPlaceholder],
        content: composerDocument(message, selectedSkills, selectedImages),
        editorProps: {
            attributes: { class: "se-prompt-rich-input", "aria-label": "设计指令" },
            handleKeyDown: (_view, event) => {
                if (event.key !== "Enter" || event.shiftKey || event.isComposing) return false;
                event.preventDefault();
                callbacks.current.onSend();
                return true;
            },
        },
        onUpdate: ({ editor: instance }) => {
            const next = readComposerDocument(instance);
            const current = callbacks.current;
            current.onMessageChange(next.message);
            const chipIds = new Set(next.chips);
            current.selectedImages.forEach((image) => { if (!chipIds.has(`image:${image.id}`)) current.onRemoveImage(image.id); });
            current.selectedSkills.forEach((skill) => { if (!chipIds.has(`skill:${skill.id}`)) current.onRemoveSkill(skill.id); });
        },
    });

    useEffect(() => {
        if (!editor) return;
        const current = readComposerDocument(editor);
        const expected = [...selectedImages.map((image) => `image:${image.id}`), ...selectedSkills.map((skill) => `skill:${skill.id}`)];
        if (current.message === message && current.chips.join("|") === expected.join("|")) return;
        editor.commands.setContent(composerDocument(message, selectedSkills, selectedImages), { emitUpdate: false });
    }, [editor, message, selectedSkills, selectedImages]);

    return <EditorContent editor={editor} className="se-prompt-editor" />;
}
