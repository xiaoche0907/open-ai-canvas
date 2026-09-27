import { useState } from "react";
import { Gem, MessageSquarePlus, Sparkles } from "lucide-react";

import type { SkillItem } from "../mock/skills.mock";

export function FeaturedSkillCard({ item, onAddToChat }: { item: SkillItem; onAddToChat?: (item: SkillItem) => void }) {
    const [mediaFailed, setMediaFailed] = useState(false);

    return (
        <article className="se-featured-card">
            <button type="button" className="se-featured-card-main" aria-label={`添加 ${item.title} 到对话`} onClick={() => onAddToChat?.(item)}>
                <span className="se-featured-card-media">
                    {mediaFailed || (!item.video && !item.image) ? (
                        <span className="se-featured-card-fallback"><Sparkles size={30} strokeWidth={1.3} aria-hidden="true" /><span>{item.title}</span></span>
                    ) : item.video ? (
                        <video src={item.video} muted loop autoPlay playsInline preload="metadata" aria-hidden="true" onError={() => setMediaFailed(true)} />
                    ) : (
                        <img src={item.image} alt="" loading="lazy" onError={() => setMediaFailed(true)} />
                    )}
                    <span className="se-featured-card-badge">SKILL</span>
                </span>
                <span className="se-featured-card-title"><Gem size={13} strokeWidth={1.8} aria-hidden="true" />{item.title}</span>
            </button>
            {onAddToChat ? (
                <button type="button" className="se-add-to-chat" onClick={() => onAddToChat(item)}>
                    <MessageSquarePlus size={13} strokeWidth={2} aria-hidden="true" />
                    添加到对话
                </button>
            ) : null}
        </article>
    );
}
