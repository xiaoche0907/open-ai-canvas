import { FolderOpen, Image, Plus, Scissors, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
    { key: "skill", label: "Skill", icon: Sparkles },
    { key: "pinterest", label: "Pinterest", icon: Image },
    { key: "assets", label: "我的素材", icon: FolderOpen },
    { key: "clipper", label: "境彻 Clipper", icon: Scissors },
] as const;

type Props = {
    active: string;
    onChange: (key: string) => void;
};

export function ExploreTopNav({ active, onChange }: Props) {
    return (
        <nav className="se-top-nav" aria-label="一级导航">
            {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        className={cn(active === tab.key && "is-active")}
                        aria-pressed={active === tab.key}
                        onClick={() => onChange(tab.key)}
                    >
                        <Icon size={15} strokeWidth={1.8} />
                        {tab.label}
                    </button>
                );
            })}
            <button type="button" className="se-top-nav-add" aria-label="创建 Skill">
                <Plus size={16} />
            </button>
        </nav>
    );
}
