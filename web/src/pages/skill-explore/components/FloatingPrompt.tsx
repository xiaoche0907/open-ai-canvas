import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { SkillContextChips, type SkillReference } from "./SkillContextChips";

type Props = {
    message: string;
    onMessageChange: (message: string) => void;
    selectedSkills: SkillReference[];
    onRemoveSkill: (id: string) => void;
    onSend: () => void;
    busy?: boolean;
};

const SHOW_AFTER = 380;

export function FloatingPrompt({ message, onMessageChange, selectedSkills, onRemoveSkill, onSend, busy = false }: Props) {
    const [visible, setVisible] = useState(false);
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        const scroller = document.querySelector<HTMLElement>(".skill-explore-page-root");
        const scrollTarget = scroller ?? window;
        const onScroll = () => {
            const top = scroller ? scroller.scrollTop : window.scrollY;
            setVisible(top > SHOW_AFTER);
        };
        scrollTarget.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => scrollTarget.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const update = () => {
            const sidebar = document.querySelector<HTMLElement>(".app-workspace-sidebar");
            setOffset(sidebar ? sidebar.offsetWidth / 2 : 0);
        };
        update();
        const sidebar = document.querySelector<HTMLElement>(".app-workspace-sidebar");
        if (sidebar) {
            const observer = new ResizeObserver(update);
            observer.observe(sidebar);
            return () => observer.disconnect();
        }
        return undefined;
    }, []);

    return (
        <div className={cn("se-floating-bar", visible && "is-visible")} style={{ left: `calc(50% + ${offset}px)` }} aria-hidden={!visible} inert={!visible}>
            <SkillContextChips skills={selectedSkills} onRemove={onRemoveSkill} />
            <input type="text" value={message} onChange={(event) => onMessageChange(event.target.value)} placeholder="告诉 境彻 你的设计想法" aria-label="你的设计想法" onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) onSend(); }} />
            <button type="button" className="se-floating-send" aria-label={busy ? "正在启动 Agent" : "发送"} disabled={!message.trim() || busy} onClick={onSend}>
                <ArrowUp size={16} />
            </button>
        </div>
    );
}
