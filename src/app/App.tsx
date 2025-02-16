import { Editor } from "@monaco-editor/react";
import { PropsWithChildren, useState } from "react";
import { BindGroupDisplay } from "./bindings";
import { DEFAULT_WGSL_CODE, useAppState } from "./state";
import { StructDisplay } from "./structs";

export const App = () => {
    const parsed = useAppState((state) => state.parsed);
    const setWGSL = useAppState((state) => state.setWGSL);

    return (
        <div className="h-screen w-screen flex flex-col">
            <div className="flex justify-between p-2 bg-slate-800 text-white items-center sticky top-0 z-20">
                <p className="text-lg font-bold ml-2">WIP</p>
                <a
                    href="https://www.w3.org/TR/WGSL/"
                    className="bg-slate-900 p-2 rounded-lg"
                    target="_blank"
                    rel="noreferrer"
                >
                    WGSL Spec
                </a>
            </div>
            <div className="flex bg-slate-50 p-4 gap-4 items-stretch">
                <Column>
                    <Container title="Editor" className="grow">
                        <Editor
                            className="h-full"
                            defaultLanguage="wgsl"
                            defaultValue={DEFAULT_WGSL_CODE}
                            onChange={setWGSL}
                        />
                    </Container>
                </Column>
                <Column>
                    <div className="bg-slate-200 p-2 flex flex-col rounded-lg gap-2">
                        <p className="text-sm font-bold">
                            {parsed.type === "error" ? parsed.error : "Parsing Complete!"}
                        </p>
                    </div>
                    <Container
                        title={
                            `Struct Layouts` + (parsed.type === "error" ? "" : ` (${parsed.reflection.structs.length})`)
                        }
                        defaultClose={true}
                    >
                        {parsed.type === "error"
                            ? "No structs available"
                            : parsed.reflection.structs.map((s) => <StructDisplay key={s.name} struct={s} />)}
                    </Container>
                    <Container title="Bindings">
                        {parsed.type === "error"
                            ? "No bindings available"
                            : parsed.reflection
                                  .getBindGroups()
                                  .map((bg, i) => (
                                      <BindGroupDisplay key={i} bg={bg} structs={parsed.reflection.structs} index={i} />
                                  ))}
                    </Container>
                    <Container title="Run Options">Run Options!</Container>
                    <Container title="Output">Output!</Container>
                </Column>
            </div>
        </div>
    );
};

const Column = ({ children }: PropsWithChildren) => <div className="basis-md grow flex flex-col gap-4">{children}</div>;
const Container = ({
    children,
    title,
    className,
    defaultClose = false,
}: PropsWithChildren<{ title: string; className?: string; defaultClose?: boolean }>) => {
    const [isMinimized, setIsMinimized] = useState(defaultClose);

    return (
        <div className={"bg-slate-200 p-2 flex flex-col rounded-lg gap-2 " + (className ?? "")}>
            <div className="border-b-1 flex justify-between items-center">
                <p className="text-lg font-bold">{title}</p>
                <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="bg-slate-300 pl-2.5 pr-2.5 pt-0.5 pb-0.5 rounded-lg text-sm hover:bg-slate-400 cursor-pointer"
                >
                    {isMinimized ? "+" : "-"}
                </button>
            </div>
            {!isMinimized && children}
        </div>
    );
};
