import { ChevronRight, Plus, ShoppingBag, Sparkles } from "lucide-react";

import type { SkillItem } from "../mock/skills.mock";
import { FeaturedSkillCard } from "./FeaturedSkillCard";

type Props = {
    items: SkillItem[];
    onAddToChat?: (item: SkillItem) => void;
    onOpenSkills?: () => void;
};

export function FeaturedSkillCollection({ items, onAddToChat, onOpenSkills }: Props) {
    return (
        <section className="se-featured" aria-label="AI 品牌精选技能">
            <div className="se-featured-info">
                <span className="se-featured-mark" aria-hidden="true">
                    <ShoppingBag size={22} strokeWidth={1.8} />
                </span>
                <span className="se-featured-eyebrow">BRAND SKILLS</span>
                <h2 className="se-featured-title">
                    境彻 AI 品牌<br />
                    <span>{items.length} 款专属 <em>Skills</em></span>
                </h2>
                <p className="se-featured-description">为这一轮创作，挑选合适的能力。</p>
                <div className="se-featured-icons" aria-label="快捷添加技能">
                    {items.slice(0, 5).map((item) => (
                        <button key={item.id} type="button" className="se-featured-icon" title={item.title} aria-label={`添加 ${item.title} 到对话`} onClick={() => onAddToChat?.(item)}>
                            <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />
                            {item.image ? <img src={item.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
                        </button>
                    ))}
                    <button type="button" className="se-featured-icon se-featured-icon-more" aria-label="打开技能库" title="打开技能库" onClick={onOpenSkills}>
                        <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                </div>
                <button type="button" className="se-featured-more" onClick={onOpenSkills}>查看全部 Skills <ChevronRight size={15} aria-hidden="true" /></button>
            </div>
            <div className={`se-featured-grid se-featured-grid-${Math.min(items.length, 4)}`}>
                {items.map((item) => (
                    <FeaturedSkillCard key={item.id} item={item} onAddToChat={onAddToChat} />
                ))}
            </div>
        </section>
    );
}
