import { ChevronRight, Gem, Image, Plus, Sparkles } from "lucide-react";

import type { SkillItem } from "../mock/skills.mock";
import { FeaturedSkillCard } from "./FeaturedSkillCard";

const ICONS = [Sparkles, Gem, Image, Plus];

type Props = {
    items: SkillItem[];
    onAddToChat?: (item: SkillItem) => void;
};

export function FeaturedSkillCollection({ items, onAddToChat }: Props) {
    return (
        <section className="se-featured" aria-label="精选专题">
            <div className="se-featured-info">
                <span className="se-featured-mark" aria-hidden>
                    <Sparkles size={22} strokeWidth={1.6} />
                </span>
                <h2 className="se-featured-title">
                    境彻 AI品牌 Skills，
                    <br />
                    {items.length} 款<span className="se-featured-highlight"> 精选 Skills</span>
                    <ChevronRight size={18} strokeWidth={1.8} className="se-featured-arrow" />
                </h2>
                <div className="se-featured-icons" aria-hidden>
                    {ICONS.map((Icon, index) => (
                        <span key={index} className="se-featured-icon">
                            <Icon size={15} strokeWidth={1.8} />
                        </span>
                    ))}
                </div>
                <p className="se-featured-hint">猜你喜欢</p>
            </div>
            <div className="se-featured-grid">
                {items.map((item) => (
                    <FeaturedSkillCard key={item.id} item={item} onAddToChat={onAddToChat} />
                ))}
            </div>
        </section>
    );
}
