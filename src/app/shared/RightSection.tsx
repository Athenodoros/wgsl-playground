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
            // Sections keep the height their content asks for, and the column they sit in scrolls.
            // Letting them shrink instead squashed every one of them at once, and gave each its own
            // little scrollbar, which is a worse way to read a panel than scrolling the side.
            className={"shrink-0 min-h-[50px] flex flex-col"}
            collapsible={!disabled}
            collapseProps={{ isOpen, onToggle: () => setIsOpen(!isOpen) }}
            icon={icon}
        >
            {disabled ? null : children}
        </Section>
    );
};
