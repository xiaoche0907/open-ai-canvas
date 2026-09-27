// 境彻「Skill 灵感广场」Mock 数据 —— 占位已清空，数据改由技能库（/api/skills?tag=aibrand）提供。
export type SkillCategory = "recommend" | "ecommerce" | "ads" | "branding" | "social" | "website" | "aibrand";

export interface SkillItem {
    id: string;
    title: string;
    description?: string;
    image: string;
    video?: string;
    author: {
        name: string;
        color: string;
    };
    users?: number;
    likes?: number;
    category: SkillCategory;
}

export const SKILLS: SkillItem[] = [];

export const FEATURED_ITEMS: SkillItem[] = [];

export const CATEGORY_SECTIONS: { key: SkillCategory; title: string }[] = [
    { key: "aibrand", title: "AI品牌" },
];