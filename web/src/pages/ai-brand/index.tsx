import { useMemo, useState } from "react";
import { App } from "antd";
import {
    ArrowRight,
    BadgeCheck,
    Boxes,
    Briefcase,
    Gem,
    Globe,
    Layers,
    Megaphone,
    Palette,
    Plus,
    SendHorizontal,
    Settings2,
    ShoppingBag,
    Sparkles,
    Store,
    Wand2,
} from "lucide-react";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { cn } from "@/lib/utils";
import "./ai-brand.css";

type CategoryKey = "all" | "ecommerce" | "ads" | "branding" | "social" | "website";

const CATEGORY_TABS: { key: CategoryKey; label: string }[] = [
    { key: "all", label: "为你推荐" },
    { key: "ecommerce", label: "E-commerce" },
    { key: "ads", label: "Ads & Creative" },
    { key: "branding", label: "Branding" },
    { key: "social", label: "Social Media" },
    { key: "website", label: "Website" },
];

const QUICK_CHIPS = ["电商", "创意", "社交媒体", "品牌", "网站"];

const SEARCH_EXAMPLES = ["让 AI 为「境彻」创建一个高端服饰品牌视觉", "生成一套电商店铺品牌 VI 系统", "为新品设计大促主视觉海报"];

type Skill = {
    id: string;
    title: string;
    desc: string;
    category: Exclude<CategoryKey, "all">;
    icon: typeof Palette;
    tone: "violet" | "pink" | "cyan" | "amber" | "emerald";
};

const SKILLS: Skill[] = [
    // E-commerce
    { id: "e1", title: "电商主图品牌化", desc: "把产品图一键套用品牌风格，输出统一视觉的电商主图。", category: "ecommerce", icon: ShoppingBag, tone: "pink" },
    { id: "e2", title: "商品详情品牌页", desc: "生成品牌化的详情页头图与卖点排版。", category: "ecommerce", icon: Layers, tone: "violet" },
    { id: "e3", title: "店铺品牌横幅", desc: "店铺首页与活动横幅的品牌视觉设计。", category: "ecommerce", icon: Store, tone: "amber" },
    { id: "e4", title: "产品图品牌系统", desc: "从单品出发，生成全套品牌化产品图。", category: "ecommerce", icon: Boxes, tone: "emerald" },
    // Ads & Creative
    { id: "a1", title: "品牌广告海报", desc: "品牌营销活动的主视觉海报生成。", category: "ads", icon: Megaphone, tone: "cyan" },
    { id: "a2", title: "大促活动视觉", desc: "双11、618 等大促节点的活动 Banner。", category: "ads", icon: Sparkles, tone: "pink" },
    { id: "a3", title: "氛围主图", desc: "带场景氛围感的产品主图设计。", category: "ads", icon: Wand2, tone: "violet" },
    { id: "a4", title: "直播间品牌素材", desc: "直播封面与品牌贴片视觉。", category: "ads", icon: Briefcase, tone: "amber" },
    // Branding
    { id: "b1", title: "品牌 Logo 生成器", desc: "输入品牌名与调性，生成标志设计。", category: "branding", icon: Gem, tone: "violet" },
    { id: "b2", title: "VI 视觉识别系统", desc: "标志、标准色板与字体规范一站式生成。", category: "branding", icon: Palette, tone: "pink" },
    { id: "b3", title: "品牌色板", desc: "为品牌生成可落地的主色与辅助色。", category: "branding", icon: Layers, tone: "cyan" },
    { id: "b4", title: "Logo 变体与场景", desc: "横版、竖版、透明底等多场景 Logo 变体。", category: "branding", icon: Boxes, tone: "emerald" },
    { id: "b5", title: "包装设计", desc: "产品包装的品牌化视觉设计。", category: "branding", icon: ShoppingBag, tone: "amber" },
    // Social Media
    { id: "s1", title: "品牌社媒套件", desc: "一套视觉覆盖多平台社媒内容。", category: "social", icon: Megaphone, tone: "pink" },
    { id: "s2", title: "品牌故事海报", desc: "叙事型品牌宣传海报设计。", category: "social", icon: Sparkles, tone: "cyan" },
    { id: "s3", title: "内容封面品牌化", desc: "公众号、小红书等内容封面统一品牌视觉。", category: "social", icon: Layers, tone: "violet" },
    // Website
    { id: "w1", title: "品牌官网视觉", desc: "官网首屏与关键页的品牌视觉方案。", category: "website", icon: Globe, tone: "emerald" },
    { id: "w2", title: "落地页品牌化", desc: "转化落地页的品牌视觉设计。", category: "website", icon: BadgeCheck, tone: "cyan" },
];

export default function AiBrandPage() {
    const { message } = App.useApp();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<CategoryKey>("all");

    const visibleSkills = useMemo(() => (category === "all" ? SKILLS : SKILLS.filter((skill) => skill.category === category)), [category]);

    const handleSearch = () => {
        message.info(query.trim() ? `搜索「${query.trim()}」：品牌技能库建设中，敬请期待` : "输入你想设计的品牌方向，例如：高端服饰品牌视觉");
    };

    return (
        <WorkspacePage fluid scroll className="ai-brand-page-root">
            <div className="ai-brand-container">
                <section className="ai-brand-hero">
                    <p className="ai-brand-eyebrow">XCSTUDIO · AI BRAND STUDIO</p>
                    <h1 className="ai-brand-title">你想设计什么？</h1>
                    <p className="ai-brand-subtitle">让 AI 从品牌名到视觉资产，一站式生成品牌标识、VI 规范与营销素材。</p>

                    <div className="ai-brand-agent">
                        <button type="button" className="ai-brand-agent-add" aria-label="添加参考图" title="添加参考图" onClick={() => message.info("参考图上传功能开发中，敬请期待")}>
                            <Plus size={18} />
                        </button>
                        <textarea
                            rows={1}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                event.target.style.height = "auto";
                                event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`;
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    handleSearch();
                                }
                            }}
                            placeholder="让 XCstudio 制作一张高转化的品牌视觉…"
                            aria-label="品牌设计指令"
                        />
                        <div className="ai-brand-agent-actions">
                            <button type="button" className="ai-brand-agent-ghost" aria-label="生成选项" title="生成选项" onClick={() => message.info("生成选项设置开发中，敬请期待")}>
                                <Settings2 size={18} />
                            </button>
                            <button type="button" className="ai-brand-agent-send" aria-label="发送" title="发送" onClick={handleSearch}>
                                <SendHorizontal size={18} />
                            </button>
                        </div>
                    </div>
                    <p className="ai-brand-agent-hint">试试：{SEARCH_EXAMPLES[0]}</p>

                    <div className="ai-brand-agent-helps">
                        <div className="ai-brand-help-row">
                            <span className="ai-brand-help-label">XCstudio 帮你做：</span>
                            {QUICK_CHIPS.map((chip) => (
                                <button key={chip} type="button" onClick={() => { setQuery(chip); message.info(`「${chip}」方向：品牌技能库建设中，敬请期待`); }}>{chip}</button>
                            ))}
                        </div>
                        <div className="ai-brand-help-row">
                            <span className="ai-brand-help-label">连接/收集灵感：</span>
                            <button type="button" onClick={() => message.info("从资产库选择参考图：开发中，敬请期待")}>从资产库选择参考图</button>
                            <button type="button" onClick={() => message.info("上传灵感图：开发中，敬请期待")}>上传灵感图</button>
                        </div>
                    </div>
                </section>

                <nav className="ai-brand-tabs" role="tablist" aria-label="品牌技能分类">
                    {CATEGORY_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            aria-selected={category === tab.key}
                            className={cn(category === tab.key && "is-active")}
                            onClick={() => setCategory(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div className="ai-brand-works">
                    <aside className="ai-brand-campaign" aria-label="AI 品牌创作月">
                        <span className="ai-brand-campaign-eyebrow">AI BRAND MONTH</span>
                        <strong className="ai-brand-campaign-title">AI 品牌设计月</strong>
                        <p className="ai-brand-campaign-desc">18 款专属技能，从 Logo 到 VI 一站生成。</p>
                        <span className="ai-brand-campaign-go" onClick={() => message.info("AI 品牌创作月活动建设中，敬请期待")}>
                            <ArrowRight size={16} />
                            立即探索
                        </span>
                    </aside>
                    <section className="ai-brand-grid" aria-label="品牌技能库">
                        {visibleSkills.map((skill) => {
                            const Icon = skill.icon;
                            return (
                                <button key={skill.id} type="button" className="ai-brand-skill-card" onClick={() => message.info(`「${skill.title}」开发中，敬请期待`)}>
                                    <span className={cn("ai-brand-skill-thumb", `tone-${skill.tone}`)}>
                                        <span className="ai-brand-skill-tag">即将上线</span>
                                        <span className="ai-brand-skill-icon"><Icon size={28} strokeWidth={1.6} /></span>
                                    </span>
                                    <span className="ai-brand-skill-body">
                                        <strong>{skill.title}</strong>
                                        <span>{skill.desc}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </section>
                </div>
            </div>
        </WorkspacePage>
    );
}
