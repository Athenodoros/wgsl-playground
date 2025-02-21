import {
    AnchorButton,
    Button,
    H6,
    MenuItem,
    MenuItemProps,
    Navbar,
    NumericInput,
    Section,
    SectionCard,
    Tag,
} from "@blueprintjs/core";
import { Select } from "@blueprintjs/select";
import { Editor } from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { WgslReflect } from "wgsl_reflect";
import { DEFAULT_WGSL_CODE } from "../utilities/constants";
import { BindingsDisplay } from "./components/BindingsDisplay";
import { StructDisplay } from "./components/StructDisplay";
import { useAppState } from "./state";

export const App = () => {
    const parsed = useAppState((state) => state.parsed);
    const setWGSL = useAppState((state) => state.setWGSL);

    const options = useMemo(() => (parsed.type === "error" ? [] : getRunOptions(parsed.reflection)), [parsed]);

    const [openSection, setOpenSection] = useState<"structs" | "bindings" | "run">("run");
    const [running, setRunning] = useState<boolean>(false);

    const [output, setOutput] = useState<CallOption | null>(null);
    useEffect(
        () => setOutput((out) => (out === null || !options.find((o) => o.id === out.id) ? options[0] ?? null : out)),
        [options]
    );

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
                        className={ContainerClasses}
                        collapsible={true}
                        collapseProps={{
                            isOpen: openSection === "structs",
                            onToggle: () => setOpenSection((open) => (open === "structs" ? "run" : "structs")),
                        }}
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
                            "Default Binding Values" +
                            (parsed.type === "error"
                                ? ""
                                : ` (${parsed.reflection.getBindGroups().reduce((acc, bg) => acc + bg.length, 0)})`)
                        }
                        className={ContainerClasses}
                        collapsible={true}
                        icon="property"
                        collapseProps={{
                            isOpen: openSection === "bindings",
                            onToggle: () => setOpenSection((open) => (open === "bindings" ? "run" : "bindings")),
                        }}
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
                                            <BindingsDisplay
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
                        title="Run Options"
                        icon="flow-end"
                        className={ContainerClasses}
                        collapsible={true}
                        collapseProps={{
                            isOpen: openSection === "run",
                            onToggle: () => setOpenSection((open) => (open === "run" ? "bindings" : "run")),
                        }}
                    >
                        <SectionCard padded={true}>
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-4 justify-between">
                                    <Select<CallOption>
                                        items={options}
                                        itemRenderer={renderCallOption}
                                        onItemSelect={setOutput}
                                        // popoverProps={{ matchTargetWidth: true }}
                                    >
                                        <Button
                                            {...getCallOptionProps(output)}
                                            outlined={true}
                                            intent="primary"
                                            // className="!min-w-2xs [&>.bp5-button-text]:!grow"
                                            rightIcon="chevron-down"
                                            disabled={options.length === 0}
                                        />
                                    </Select>
                                    <div className="flex gap-2">
                                        <Button
                                            className="w-24"
                                            minimal={true}
                                            intent="primary"
                                            text={running ? undefined : "Run Once"}
                                            disabled={!output || running}
                                            loading={running}
                                        />
                                        <Button
                                            className="w-28"
                                            intent={running ? "danger" : "primary"}
                                            text={running ? "Stop Running" : "Start Running"}
                                            onClick={() => setRunning((running) => !running)}
                                            disabled={!output}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    {output?.type === "compute" ? (
                                        <>
                                            <div className="flex gap-2 items-center">
                                                <H6 className="!mb-0">Work Group Size</H6>
                                                <p className="text-sm text-slate-500 !mb-0 italic">(X, Y, Z)</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <NumericInput
                                                    placeholder="X"
                                                    allowNumericCharactersOnly={true}
                                                    buttonPosition="none"
                                                    className="[&>.bp5-input-group]:!w-20"
                                                    defaultValue={output.threads[0]}
                                                    onValueChange={(value) =>
                                                        setOutput({
                                                            ...output,
                                                            threads: [value, output.threads[1], output.threads[2]],
                                                        })
                                                    }
                                                />
                                                <NumericInput
                                                    placeholder="Y"
                                                    allowNumericCharactersOnly={true}
                                                    buttonPosition="none"
                                                    className="[&>.bp5-input-group]:!w-20"
                                                    defaultValue={output.threads[1]}
                                                    onValueChange={(value) =>
                                                        setOutput({
                                                            ...output,
                                                            threads: [output.threads[0], value, output.threads[2]],
                                                        })
                                                    }
                                                />
                                                <NumericInput
                                                    placeholder="Z"
                                                    allowNumericCharactersOnly={true}
                                                    buttonPosition="none"
                                                    className="[&>.bp5-input-group]:!w-20"
                                                    defaultValue={output.threads[2]}
                                                    onValueChange={(value) =>
                                                        setOutput({
                                                            ...output,
                                                            threads: [output.threads[0], output.threads[1], value],
                                                        })
                                                    }
                                                />
                                            </div>
                                        </>
                                    ) : output?.type === "render" ? (
                                        <>
                                            <div className="flex gap-2 items-center">
                                                <H6 className="!mb-0">Vertices</H6>
                                                <p className="text-sm text-slate-500 !mb-0 italic">(Count)</p>
                                            </div>
                                            <div className="flex gap-2 items-center">
                                                <NumericInput
                                                    placeholder="Count"
                                                    allowNumericCharactersOnly={true}
                                                    buttonPosition="none"
                                                    className="[&>.bp5-input-group]:!w-20"
                                                    defaultValue={output.vertices}
                                                    onValueChange={(value) => setOutput({ ...output, vertices: value })}
                                                />
                                            </div>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        </SectionCard>
                        <SectionCard padded={true}>Output Two!</SectionCard>
                    </Section>
                </div>
            </div>
        </div>
    );
};

const ContainerClasses =
    "[&>.bp5-section-header]:shrink-0 [&>.bp5-collapse]:!overflow-y-auto flex flex-col min-h-[50px]";

const renderCallOption = (option: CallOption) => {
    return (
        <MenuItem
            key={option.id}
            {...getCallOptionProps(option)}
            disabled={option.type === "function" || option.type === "render-triangles"}
        />
    );
};

const getCallOptionProps = (option: CallOption | null): Pick<MenuItemProps, "icon" | "text"> => {
    if (!option) {
        return { icon: "widget", text: "No options available" };
    }

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
    | { id: string; type: "compute"; name: string; threads: [number, number, number] }
    | { id: string; type: "function"; name: string }
    | { id: string; type: "render-triangles"; vertex: string }
    | { id: string; type: "render"; vertex: string; fragment: string; vertices: number };

const getRunOptions = (reflection: WgslReflect) => {
    const fragments = reflection.functions.filter((f) => f.stage === "fragment");

    return reflection.functions.flatMap((f): CallOption[] => {
        if (f.stage === null) {
            return [{ id: `function-${f.name}`, type: "function", name: f.name }];
        }

        if (f.stage === "compute") {
            return [{ id: `compute-${f.name}`, type: "compute", name: f.name, threads: [1, 1, 1] }];
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
                    vertices: 3,
                }))
            );
        }

        return [];
    });
};
