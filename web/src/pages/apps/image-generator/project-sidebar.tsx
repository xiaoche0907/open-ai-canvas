import { useMemo, useState } from "react";
import { Popconfirm } from "antd";
import {
    ChevronDown,
    ChevronRight,
    History,
    Image as ImageIcon,
    Pencil,
    Pin,
    PanelLeftClose,
    Plus,
    Search,
    Sparkles,
    Trash2,
} from "lucide-react";

import type { ImageGenProject } from "./types";

interface ImageGenProjectSidebarProps {
    projects: ImageGenProject[];
    activeProjectId: string;
    collapsed: boolean;
    onChangeCollapsed: (collapsed: boolean) => void;
    onOpenCreation: () => void;
    onCreateProject: () => void;
    onSelectProject: (project: ImageGenProject) => void;
    onRenameProject: (id: string, title: string) => void;
    onDeleteProject: (id: string) => void;
    onTogglePinProject: (id: string) => void;
}

function projectDateGroup(dateValue: string) {
    const date = new Date(dateValue);
    if (!Number.isFinite(date.getTime())) return "更早";
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startToday - startDate) / 86_400_000);
    if (days <= 0) return "今天";
    if (days === 1) return "昨天";
    if (days < 7) return "本周";
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function ImageGenProjectSidebar({
    projects,
    activeProjectId,
    collapsed,
    onChangeCollapsed,
    onOpenCreation,
    onCreateProject,
    onSelectProject,
    onRenameProject,
    onDeleteProject,
    onTogglePinProject,
}: ImageGenProjectSidebarProps) {
    const [historyOpen, setHistoryOpen] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    const groupedProjects = useMemo(() => {
        const normalizedKeyword = keyword.trim().toLocaleLowerCase();
        const filtered = projects
            .filter((project) => !normalizedKeyword || project.title.toLocaleLowerCase().includes(normalizedKeyword))
            .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return filtered.reduce<Array<{ label: string; projects: ImageGenProject[] }>>((groups, project) => {
            const label = projectDateGroup(project.updatedAt);
            const existing = groups.find((group) => group.label === label);
            if (existing) existing.projects.push(project);
            else groups.push({ label, projects: [project] });
            return groups;
        }, []);
    }, [keyword, projects]);

    const commitRename = (project: ImageGenProject) => {
        const nextTitle = renameValue.trim();
        if (nextTitle && nextTitle !== project.title) onRenameProject(project.id, nextTitle);
        setRenamingId(null);
    };

    if (collapsed) {
        return (
            <button type="button" className="image-gen-history-launcher" onClick={() => onChangeCollapsed(false)}>
                <History className="size-4" />
                <span>历史记录</span>
                <em>{projects.length}</em>
            </button>
        );
    }

    return (
        <aside className="image-gen-project-sidebar">
            <div className="image-gen-sidebar-heading">
                <button type="button" className="image-gen-sidebar-nav" onClick={onOpenCreation}>
                    <Sparkles className="size-4" />
                    <span>创作</span>
                </button>
                <button type="button" className="image-gen-sidebar-collapse" onClick={() => onChangeCollapsed(true)} title="收起项目历史" aria-label="收起项目历史">
                    <PanelLeftClose className="size-4" />
                </button>
            </div>

            <button
                type="button"
                className={`image-gen-sidebar-nav is-history ${historyOpen ? "is-active" : ""}`}
                onClick={() => setHistoryOpen((open) => !open)}
                aria-expanded={historyOpen}
            >
                <History className="size-4" />
                <span>历史</span>
                {historyOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>

            {historyOpen && (
                <div className="image-gen-sidebar-history">
                    <button type="button" className="image-gen-new-project-btn" onClick={onCreateProject}>
                        <Plus className="size-4" />
                        <span>新建项目</span>
                    </button>

                    <label className="image-gen-project-search">
                        <Search className="size-4" />
                        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索项目" />
                    </label>

                    <div className="image-gen-project-list">
                        {groupedProjects.map((group) => (
                            <section key={group.label} className="image-gen-project-group">
                                <div className="image-gen-project-group-label">{group.label}</div>
                                {group.projects.map((project) => {
                                    const active = project.id === activeProjectId;
                                    const thumbnail = project.results[project.results.length - 1]?.url;
                                    return (
                                        <div key={project.id} className={`image-gen-project-row ${active ? "is-active" : ""}`}>
                                            <div
                                                className="image-gen-project-select"
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => onSelectProject(project)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") onSelectProject(project);
                                                }}
                                            >
                                                <span className="image-gen-project-thumb">
                                                    {thumbnail ? <img src={thumbnail} alt="" /> : <ImageIcon className="size-5" />}
                                                </span>
                                                {renamingId === project.id ? (
                                                    <input
                                                        className="image-gen-project-rename"
                                                        value={renameValue}
                                                        autoFocus
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) => setRenameValue(event.target.value)}
                                                        onBlur={() => commitRename(project)}
                                                        onKeyDown={(event) => {
                                                            event.stopPropagation();
                                                            if (event.key === "Enter") event.currentTarget.blur();
                                                            if (event.key === "Escape") setRenamingId(null);
                                                        }}
                                                    />
                                                ) : (
                                                    <span className="image-gen-project-name" title={project.title}>{project.title}</span>
                                                )}
                                            </div>

                                            <div className="image-gen-project-actions">
                                                <button
                                                    type="button"
                                                    title="重命名"
                                                    aria-label={`重命名 ${project.title}`}
                                                    onClick={() => {
                                                        setRenamingId(project.id);
                                                        setRenameValue(project.title);
                                                    }}
                                                >
                                                    <Pencil className="size-3.5" />
                                                </button>
                                                <Popconfirm
                                                    title="删除这个项目？"
                                                    description="项目记录会被删除，已入库的资产不会受到影响。"
                                                    okText="删除"
                                                    cancelText="取消"
                                                    okButtonProps={{ danger: true }}
                                                    onConfirm={() => onDeleteProject(project.id)}
                                                >
                                                    <button type="button" title="删除" aria-label={`删除 ${project.title}`}>
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                </Popconfirm>
                                                <button
                                                    type="button"
                                                    className={project.pinned ? "is-pinned" : ""}
                                                    title={project.pinned ? "取消置顶" : "置顶"}
                                                    aria-label={`${project.pinned ? "取消置顶" : "置顶"} ${project.title}`}
                                                    onClick={() => onTogglePinProject(project.id)}
                                                >
                                                    <Pin className="size-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </section>
                        ))}
                        {!groupedProjects.length && <div className="image-gen-project-empty">没有匹配的项目</div>}
                    </div>
                </div>
            )}
        </aside>
    );
}
