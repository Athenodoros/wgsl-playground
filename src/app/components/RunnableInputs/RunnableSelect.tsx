import { Button, MenuItem, MenuItemProps } from "@blueprintjs/core";
import { ItemRenderer, MultiSelect, Select } from "@blueprintjs/select";
import React from "react";
import { toggleRunnable } from "../../../utilities/runTarget";
import { RunTarget, Runnable } from "../../../utilities/types";

/**
 * Picks which of the target's kind to run, once the kind itself has been chosen above.
 *
 * Compute passes are the only kind that chains, so they get a multi-select whose tags are the run
 * order; everything else is one of a list behind a button. Either is disabled when the shader has
 * only one of that kind, since the kind then says everything there is to say and the picker would be
 * a control with one setting.
 */
export const RunnableSelect: React.FC<{
    options: Runnable[];
    target: RunTarget;
    setRunTarget: (target: RunTarget) => void;
}> = ({ options, target, setRunTarget }) => {
    if (target.type === "none") return null;

    const choices = options.filter((option) => option.type === target.type);
    const toggle = (runnable: Runnable) => setRunTarget(toggleRunnable(target, runnable));

    // The shader has only one of this kind, so the picker has nothing left to decide.
    const settled = choices.length < 2;

    if (target.type !== "compute")
        return (
            <Select<Runnable>
                items={choices}
                itemRenderer={renderRunnable([target.runnable])}
                onItemSelect={(runnable) => setRunTarget(toggleRunnable({ type: "none" }, runnable))}
                filterable={false}
                disabled={settled}
                popoverProps={{ minimal: true }}
            >
                <Button
                    {...getRunnableProps(target.runnable)}
                    variant="outlined"
                    intent="primary"
                    endIcon="chevron-down"
                    disabled={settled}
                />
            </Select>
        );

    // MultiSelect works over a plain array of the type it is built on, not the non-empty tuple.
    const passes: Runnable[] = target.passes;
    return (
        <MultiSelect<Runnable>
            items={choices}
            // A count edited by hand replaces the pass it was edited on, so identity is no use for
            // telling which of the choices is in the target.
            itemsEqual="id"
            selectedItems={passes}
            itemRenderer={renderRunnable(passes)}
            tagRenderer={(runnable) => getRunnableProps(runnable).text}
            onItemSelect={toggle}
            onRemove={toggle}
            // Blueprint draws the clear button from this handler alone, so leaving it off is what
            // takes the cross away: with one pass there is nothing to clear to, and a disabled cross
            // reads as something broken rather than something that was never on offer.
            onClear={settled ? undefined : () => setRunTarget({ type: "none" })}
            placeholder="Nothing to run"
            disabled={settled}
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
