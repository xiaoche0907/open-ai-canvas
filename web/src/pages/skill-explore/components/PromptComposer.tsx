import { useState, type RefObject } from "react";
import { ArrowUp, LoaderCircle, Plus } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";
import { SkillContextChips, type SkillReference } from "./SkillContextChips";

type Props = {
    message: string;
    onMessageChange: (message: string) => void;
    onSend: () => void;
    busy?: boolean;
    selectedSkills: SkillReference[];
    onRemoveSkill: (id: string) => void;
    textareaRef?: RefObject<HTMLTextAreaElement | null>;
    config: AiConfig;
    selectedModel: string;
    onModelChange: (model: string) => void;
};

export function PromptComposer({ message, onMessageChange, onSend, busy = false, selectedSkills, onRemoveSkill, textareaRef, config, selectedModel, onModelChange }: Props) {
    const [focused, setFocused] = useState(false);
    const canSend = message.trim().length > 0;

    return (
        <div className={cn("se-prompt-box", focused && "is-focused")}>
            <div className="se-prompt-line">
                <SkillContextChips skills={selectedSkills} onRemove={onRemoveSkill} />
                <textarea
                    ref={textareaRef}
                    rows={2}
                    value={message}
                    onChange={(event) => onMessageChange(event.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            onSend();
                        }
                    }}
                    placeholder={selectedSkills.length > 0 ? "补充你的设计想法…" : "让 境彻 帮你设计一张美丽的婚礼海报"}
                    aria-label="设计指令"
                />
            </div>
            <div className="se-prompt-toolbar">
                <button type="button" className="se-prompt-icon-btn" aria-label="添加图片或附件" title="添加图片或附件">
                    <Plus size={17} />
                </button>
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
