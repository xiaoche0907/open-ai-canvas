import { ChevronRight } from "lucide-react";

import type { SkillItem } from "../mock/skills.mock";
import { SkillCard } from "./SkillCard";

type Props = {
    title: string;
    items: SkillItem[];
    loading?: boolean;
    error?: string;
    onAddToChat?: (item: SkillItem) => void;
};

export function SkillSection({ title, items, loading, error, onAddToChat }: Props) {
    if (loading) {
        return (
            <section className="se-skill-section">
                <h2 className="se-section-title">
                    {title}
                    <ChevronRight size={14} strokeWidth={2} />
                </h2>
                <div className="se-section-empty">正在加载 AI品牌 技能…</div>
            </section>
        );
    }
    if (error) {
        return (
            <section className="se-skill-section">
                <h2 className="se-section-title">
                    {title}
                    <ChevronRight size={14} strokeWidth={2} />
                </h2>
                <div className="se-section-empty">{error}</div>
            </section>
        );
    }
    if (items.length === 0) {
        return (
            <section className="se-skill-section">
                <h2 className="se-section-title">
                    {title}
                    <ChevronRight size={14} strokeWidth={2} />
                </h2>
                <div className="se-section-empty">暂无 AI品牌 技能，去技能库分类创建或安装后即会展示在这里。</div>
            </section>
        );
    }
    return (
        <section className="se-skill-section">
            <h2 className="se-section-title">
                {title}
                <ChevronRight size={14} strokeWidth={2} />
            </h2>
            <div className="se-skill-grid">
                {items.map((item) => (
                    <SkillCard key={item.id} item={item} onAddToChat={onAddToChat} />
                ))}
            </div>
        </section>
    );
}
