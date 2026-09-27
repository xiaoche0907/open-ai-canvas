import { Gem, MessageSquarePlus } from "lucide-react";

import type { SkillItem } from "../mock/skills.mock";

export function FeaturedSkillCard({ item, onAddToChat }: { item: SkillItem; onAddToChat?: (item: SkillItem) => void }) {
    return (
        <figure className="se-featured-card" role="button" tabIndex={onAddToChat ? 0 : undefined} aria-label={`添加 ${item.title} 到对话`} onClick={() => onAddToChat?.(item)} onKeyDown={(event) => {
            if (onAddToChat && (event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) {
                event.preventDefault();
                onAddToChat(item);
            }
        }}>
            <span className="se-featured-card-media">
                {item.video ? (
                    <video src={item.video} muted loop autoPlay playsInline preload="metadata" aria-label={item.title} />
                ) : (
                    <img src={item.image} alt={item.title} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                )}
                {onAddToChat ? (
                    <button type="button" className="se-add-to-chat" onClick={(event) => { event.stopPropagation(); onAddToChat(item); }}>
                        <MessageSquarePlus size={13} strokeWidth={2} aria-hidden />
                        添加到对话
                    </button>
                ) : null}
            </span>
            <figcaption className="se-featured-card-title">
                <Gem size={12} strokeWidth={2} aria-hidden />
                {item.title}
            </figcaption>
        </figure>
    );
}
