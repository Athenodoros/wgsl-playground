import { MenuItem, MenuItemProps } from "@blueprintjs/core";
import { ItemRenderer, MultiSelect } from "@blueprintjs/select";
import React from "react";
import { targetRunnables, toggleRunnable } from "../../../utilities/runTarget";
import { RunTarget, Runnable } from "../../../utilities/types";

/**
 * Picks what to run, and in what order.
 *
 * Compute passes accumulate as tags in the order they were picked, which is the order they will run
 * in. Anything else replaces the lot, because a function and a render pass can each only be run on
 * their own - the rule lives in `toggleRunnable`, so this only has to show the result.
 */
export const RunnableSelect: React.FC<{
    options: Runnable[];
    target: RunTarget;
    setRunTarget: (target: RunTarget) => void;
}> = ({ options, target, setRunTarget }) => {
    const selected = targetRunnables(target);
    const toggle = (runnable: Runnable) => setRunTarget(toggleRunnable(target, runnable));

    return (
        <MultiSelect<Runnable>
            items={options}
            // A count edited by hand replaces the runnable it was edited on, so identity is no use
            // for telling which of the options is in the target.
            itemsEqual="id"
            selectedItems={selected}
            itemRenderer={renderRunnable(selected)}
            tagRenderer={(runnable) => getRunnableProps(runnable).text}
            onItemSelect={toggle}
            onRemove={toggle}
            onClear={() => setRunTarget({ type: "none" })}
            placeholder="Nothing to run"
            disabled={options.length === 0}
            popoverProps={{ matchTargetWidth: true, minimal: true }}
        />
    );
};

const renderRunnable =
    (selected: Runnable[]): ItemRenderer<Runnable> =>
    (runnable, { handleClick, modifiers }) =>
        modifiers.matchesPredicate ? (
            <MenuItem
                key={runnable.id}
                {...getRunnableProps(runnable)}
                onClick={handleClick}
                active={modifiers.active}
                selected={selected.some((entry) => entry.id === runnable.id)}
                roleStructure="listoption"
            />
        ) : null;

const getRunnableProps = (runnable: Runnable): Pick<MenuItemProps, "icon"> & { text: string } => {
    switch (runnable.type) {
        case "render":
            return { icon: "media", text: `${runnable.vertex} + ${runnable.fragment}` };
        case "compute":
            return { icon: "derive-column", text: runnable.name };
        case "function":
            return { icon: "variable", text: runnable.name };
    }
};
