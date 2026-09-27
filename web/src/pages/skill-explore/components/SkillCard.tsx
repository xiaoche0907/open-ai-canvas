import { ChevronRight, Image as ImageIcon, MessageSquarePlus } from "lucide-react";

import type { SkillItem } from "../mock/skills.mock";

export function SkillCard({ item, onAddToChat }: { item: SkillItem; onAddToChat?: (item: SkillItem) => void }) {
    return (
        <article className="se-skill-card" role="button" tabIndex={onAddToChat ? 0 : undefined} aria-label={`添加 ${item.title} 到对话`} onClick={() => onAddToChat?.(item)} onKeyDown={(event) => {
            if (onAddToChat && (event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                event.preventDefault();
                onAddToChat(item);
            }
        }}>
            <div className="se-skill-media">
                {item.video ? (
                    <video src={item.video} muted loop autoPlay playsInline preload="metadata" aria-label={item.title} />
                ) : (
                    <img src={item.image} alt={item.title} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                )}
                <span className="se-skill-type-icon" aria-hidden>
                    <ImageIcon size={11} strokeWidth={2} />
                </span>
                {onAddToChat ? (
                    <button type="button" className="se-add-to-chat" onClick={(event) => { event.stopPropagation(); onAddToChat(item); }}>
                        <MessageSquarePlus size={13} strokeWidth={2} aria-hidden />
                        添加到对话
                    </button>
                ) : null}
            </div>
            <h3 className="se-skill-title">{item.title}</h3>
            {item.description ? <p className="se-skill-desc">{item.description}</p> : null}
            <p className="se-skill-meta">
                <span className="se-skill-avatar" style={{ background: item.author.color }} aria-hidden />
                {item.author.name}
                {item.users !== undefined ? <span> · {item.users >= 1000 ? `${(item.users / 1000).toFixed(1).replace(".0", "")}k` : item.users}</span> : null}
                {item.likes !== undefined ? <span> · {item.likes}</span> : null}
                <ChevronRight size={12} strokeWidth={2} className="se-skill-meta-arrow" />
            </p>
        </article>
    );
}
