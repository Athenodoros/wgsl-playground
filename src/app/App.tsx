import { AnchorButton, Button, MenuItem, MenuItemProps, Navbar, Section, SectionCard, Tag } from "@blueprintjs/core";
import { Select } from "@blueprintjs/select";
import { Editor } from "@monaco-editor/react";
import { useMemo } from "react";
import { WgslReflect } from "wgsl_reflect";
import { BindGroupDisplay } from "./bindings";
import { DEFAULT_WGSL_CODE, useAppState } from "./state";
import { StructDisplay } from "./structs";

export const App = () => {
    const parsed = useAppState((state) => state.parsed);
    const setWGSL = useAppState((state) => state.setWGSL);

    const runOptions = useMemo(() => (parsed.type === "error" ? [] : getRunOptions(parsed.reflection)), [parsed]);

    return (
        <div className="h-screen w-screen bg-slate-50 flex flex-col">
            <Navbar fixedToTop={true} className="bp5-dark z-10">
                <Navbar.Group align="left">
                    <Navbar.Heading>WGSL Playground</Navbar.Heading>
                </Navbar.Group>
                <Navbar.Group align="right">
                    <AnchorButton icon="share" text="WGSL Spec" href="https://www.w3.org/TR/WGSL/" outlined={true} />
                </Navbar.Group>
            </Navbar>
            <div className="flex p-4 gap-4 items-stretch h-screen pt-16.5">
                <div className="basis-md grow flex flex-col gap-4">
                    <Section
                        title="Editor"
                        className="grow shrink flex flex-col"
                        rightElement={
                            <Tag intent={parsed.type === "error" ? "danger" : "success"} minimal={true} large={true}>
                                {parsed.type === "error" ? parsed.error : "Parsing Successful"}
                            </Tag>
                        }
                    >
                        <div className="bg-slate-200 p-2 grow shrink">
                            <Editor
                                // className="h-64 grow"
                                defaultLanguage="wgsl"
                                defaultValue={DEFAULT_WGSL_CODE}
                                onChange={setWGSL}
                            />
                        </div>
                    </Section>
                </div>
                <div className="basis-md grow flex flex-col gap-4">
                    <Section
                        title={
                            `Struct Layouts` + (parsed.type === "error" ? "" : ` (${parsed.reflection.structs.length})`)
                        }
                        className="[&>.bp5-section-header]:shrink-0 [&>.bp5-collapse]:!overflow-y-auto flex flex-col min-h-[50px]"
                        collapsible={true}
                        collapseProps={{ defaultIsOpen: false }}
                        icon="curly-braces"
                    >
                        <SectionCard padded={true}>
                            {parsed.type === "error"
                                ? "No structs available"
                                : parsed.reflection.structs.map((s) => <StructDisplay key={s.name} struct={s} />)}
                        </SectionCard>
                    </Section>
                    <Section
                        title={
                            "Bindings" +
                            (parsed.type === "error"
                                ? ""
                                : ` (${parsed.reflection.getBindGroups().reduce((acc, bg) => acc + bg.length, 0)})`)
                        }
                        className="[&>.bp5-section-header]:shrink-0 [&>.bp5-collapse]:!overflow-y-auto flex flex-col min-h-[50px]"
                        collapsible={true}
                        icon="property"
                        collapseProps={{ defaultIsOpen: false }}
                    >
                        <SectionCard padded={parsed.type === "error"}>
                            {parsed.type === "error" ? (
                                "No bindings available"
                            ) : (
                                <div className="flex flex-col gap-4 mt-2">
                                    {parsed.reflection
                                        .getBindGroups()
                                        .flatMap((bg, idx) => bg.map((b, i) => ({ binding: b, group: idx, index: i })))
                                        .map(({ binding, group, index }) => (
                                            <BindGroupDisplay
                                                key={index}
                                                binding={binding}
                                                structs={parsed.reflection.structs}
                                                group={group}
                                                index={index}
                                            />
                                        ))}
                                </div>
                            )}
                        </SectionCard>
                    </Section>
                    <Section
                        title="Run Output"
                        icon="flow-end"
                        className="[&>.bp5-section-header]:shrink-0 [&>.bp5-collapse]:!overflow-y-auto flex flex-col min-h-[50px] grow"
                        rightElement={
                            <Select
                                items={runOptions}
                                itemRenderer={renderCallOption}
                                onItemSelect={console.log}
                                popoverProps={{ matchTargetWidth: true }}
                            >
                                <Button
                                    {...getCallOptionProps(runOptions[0])}
                                    outlined={true}
                                    intent="primary"
                                    className="!min-w-2xs [&>.bp5-button-text]:!grow"
                                    rightIcon="chevron-down"
                                />
                            </Select>
                        }
                    >
                        <SectionCard padded={true}>Output!</SectionCard>
                    </Section>
                </div>
            </div>
        </div>
    );
};

const renderCallOption = (option: CallOption) => {
    return <MenuItem key={option.id} {...getCallOptionProps(option)} />;
};

const getCallOptionProps = (option: CallOption): Pick<MenuItemProps, "icon" | "text"> => {
    switch (option.type) {
        case "render-triangles":
            return { icon: "widget", text: `${option.vertex} (Render Triangles)` };
        case "render":
            return { icon: "media", text: `${option.vertex} + ${option.fragment}` };
        case "compute":
            return { icon: "derive-column", text: `${option.name}` };
        case "function":
            return { icon: "variable", text: `${option.name}` };
    }
};

type CallOption =
    | { id: string; type: "compute"; name: string }
    | { id: string; type: "function"; name: string }
    | { id: string; type: "render-triangles"; vertex: string }
    | { id: string; type: "render"; vertex: string; fragment: string };

const getRunOptions = (reflection: WgslReflect) => {
    const fragments = reflection.functions.filter((f) => f.stage === "fragment");

    return reflection.functions.flatMap((f): CallOption[] => {
        if (f.stage === null) {
            return [{ id: `function-${f.name}`, type: "function", name: f.name }];
        }

        if (f.stage === "compute") {
            return [{ id: `compute-${f.name}`, type: "compute", name: f.name }];
        }

        if (f.stage === "vertex") {
            return [
                { id: `render-triangles-${f.name}`, type: "render-triangles", vertex: f.name } as CallOption,
            ].concat(
                fragments.map((frag) => ({
                    id: `render-${f.name}-${frag.name}`,
                    type: "render",
                    vertex: f.name,
                    fragment: frag.name,
                }))
            );
        }

        return [];
    });
};
