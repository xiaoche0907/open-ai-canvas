import { cn } from "@/lib/utils";

const CATEGORIES = ["AI品牌"] as const;

type Props = {
    active: string;
    onChange: (key: string) => void;
};

export function CategoryTabs({ active, onChange }: Props) {
    return (
        <nav className="se-category-tabs" aria-label="内容分类">
            {CATEGORIES.map((label) => (
                <button key={label} type="button" className={cn(active === label && "is-active")} aria-pressed={active === label} onClick={() => onChange(label)}>
                    {label}
                </button>
            ))}
        </nav>
    );
}
