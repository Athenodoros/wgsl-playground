import { IconName, Section } from "@blueprintjs/core";
import React, { ReactNode, useState } from "react";
import { useAppState } from "../../state";

interface RightSectionProps {
    title: string;
    icon: IconName;
    startClosed?: boolean;
    disabled?: boolean;
    /** Keeps the contents mounted while collapsed, for anything that would lose its state on unmount. */
    keepChildrenMounted?: boolean;
    /** Shown in the header, beside the collapse caret, while the section is collapsed. */
    collapsedHeaderElement?: ReactNode;
    /** Collapses whenever the shader asks with `playground-collapse-sections`. */
    followsCollapseComment?: boolean;
    children?: ReactNode | undefined;
}
export const RightSection: React.FC<RightSectionProps> = ({
    title,
    icon,
    disabled,
    children,
    startClosed,
    keepChildrenMounted,
    collapsedHeaderElement,
    followsCollapseComment,
}) => {
    const [isOpen, setIsOpen] = useState(!startClosed);

    // Each request closes the section once, and it is the user's to open again after that.
    const collapseRequests = useAppState((state) => state.collapseRequests);
    const [seenRequests, setSeenRequests] = useState(collapseRequests);
    if (collapseRequests !== seenRequests) {
        setSeenRequests(collapseRequests);
        if (followsCollapseComment) setIsOpen(false);
    }

    return (
        <Section
            title={title}
            // Sections keep the height their content asks for, and the column they sit in scrolls.
            // Letting them shrink instead squashed every one of them at once, and gave each its own
            // little scrollbar, which is a worse way to read a panel than scrolling the side.
            className={"shrink-0 min-h-[50px] flex flex-col"}
            collapsible={!disabled}
            collapseProps={{ isOpen, onToggle: () => setIsOpen(!isOpen), keepChildrenMounted }}
            icon={icon}
            rightElement={
                !isOpen && collapsedHeaderElement ? (
                    // Clicking the header toggles the section, so a click anywhere in this padding is
                    // caught before it can - a near miss on a button does nothing, rather than open the
                    // section out from under the pointer.
                    <div className="-my-2 py-2 px-3 cursor-default" onClick={(event) => event.stopPropagation()}>
                        {collapsedHeaderElement}
                    </div>
                ) : undefined
            }
        >
            {disabled ? null : children}
        </Section>
    );
};
