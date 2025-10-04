import { IconName, Section } from "@blueprintjs/core";
import React, { ReactNode, useState } from "react";

interface RightSectionProps {
    title: string;
    icon: IconName;
    startClosed?: boolean;
    disabled?: boolean;
    children?: ReactNode | undefined;
}
export const RightSection: React.FC<RightSectionProps> = ({ title, icon, disabled, children, startClosed }) => {
    const [isOpen, setIsOpen] = useState(!startClosed);

    return (
        <Section
            title={title}
            className={"[&>.bp5-section-header]:shrink-0 min-h-[50px] [&>.bp5-collapse]:!overflow-y-auto flex flex-col"}
            collapsible={!disabled}
            collapseProps={{ isOpen, onToggle: () => setIsOpen(!isOpen) }}
            icon={icon}
        >
            {disabled ? null : children}
        </Section>
    );
};
