import { Button, MenuItem, MenuItemProps } from "@blueprintjs/core";
import { ItemRenderer, Select } from "@blueprintjs/select";
import React from "react";
import { Runnable } from "../../../utilities/types";

export const RunnableDropdown: React.FC<{
    options: Runnable[];
    selected: Runnable | null;
    setOutput: (option: Runnable) => void;
}> = ({ options, selected, setOutput }) => (
    <Select<Runnable> items={options} itemRenderer={renderCallOption} onItemSelect={setOutput}>
        <Button
            {...getCallOptionProps(selected)}
            variant="outlined"
            intent="primary"
            endIcon="chevron-down"
            disabled={options.length === 0}
        />
    </Select>
);

const renderCallOption: ItemRenderer<Runnable> = (runnable, { handleClick }) => (
    <MenuItem key={runnable.id} {...getCallOptionProps(runnable)} onClick={handleClick} />
);

const getCallOptionProps = (runnable: Runnable | null): Pick<MenuItemProps, "icon" | "text"> => {
    if (!runnable) {
        return { icon: "widget", text: "No options available" };
    }

    switch (runnable.type) {
        case "render":
            return { icon: "media", text: `${runnable.vertex} + ${runnable.fragment}` };
        case "compute":
            return { icon: "derive-column", text: `${runnable.name}` };
        case "function":
            return { icon: "variable", text: `${runnable.name}` };
    }
};
