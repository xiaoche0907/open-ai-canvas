import type { ComponentType } from "react";

type Props = {
    label: string;
    icon?: ComponentType<{ size?: number | string; strokeWidth?: number }>;
    onClick?: () => void;
};

export function QuickActionChip({ label, icon: Icon, onClick }: Props) {
    return (
        <button type="button" className="se-chip" onClick={onClick}>
            {Icon ? <Icon size={13} strokeWidth={1.8} /> : null}
            {label}
        </button>
    );
}
