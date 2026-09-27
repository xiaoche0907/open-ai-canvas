import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

export interface SkillReference {
    id: string;
    name: string;
    icon?: string;
    version?: string;
}

function SkillChip({ skill, onRemove }: { skill: SkillReference; onRemove?: (id: string) => void }) {
    const [removing, setRemoving] = useState(false);

    useEffect(() => {
        if (!removing || !onRemove) return;
        const timer = window.setTimeout(() => onRemove(skill.id), 130);
        return () => window.clearTimeout(timer);
    }, [removing, onRemove, skill.id]);

    return (
        <span className={`se-prompt-chip${removing ? " is-removing" : ""}`}>
            <Sparkles size={12} strokeWidth={1.8} aria-hidden="true" />
            <span className="se-prompt-chip-name">{skill.name}</span>
            {onRemove ? (
                <button type="button" className="se-prompt-chip-remove" aria-label={`移除技能 ${skill.name}`} disabled={removing} onClick={() => setRemoving(true)}>
                    <X size={12} strokeWidth={2} aria-hidden="true" />
                </button>
            ) : null}
        </span>
    );
}

export function SkillContextChips({ skills, onRemove }: { skills: SkillReference[]; onRemove?: (id: string) => void }) {
    if (skills.length === 0) return null;

    return (
        <div className="se-prompt-chips" aria-label="本轮使用的技能">
            {skills.map((skill) => <SkillChip key={skill.id} skill={skill} onRemove={onRemove} />)}
        </div>
    );
}
