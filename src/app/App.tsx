import { Editor } from "@monaco-editor/react";
import { PropsWithChildren } from "react";
import { DEFAULT_WGSL_CODE, useAppState } from "./state";
import { getDefaultValue, getTypeDisplay } from "./values";

export const App = () => {
    const parsed = useAppState((state) => state.parsed);
    const setWGSL = useAppState((state) => state.setWGSL);

    return (
        <div className="h-screen w-screen flex flex-col">
            <div className="flex justify-between p-2 bg-slate-800 text-white items-center">
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
                    <Container title="Parse Results">
                        {parsed.type === "error" ? parsed.error : "Parsing Complete!"}
                    </Container>
                </Column>
                <Column>
                    <Container title="Bindings">
                        {parsed.type === "error"
                            ? "No bindings available"
                            : parsed.reflection.getBindGroups().map((bg, i) => (
                                  <div key={i} className="border-l-1 pl-2 pr-2">
                                      <p className="text-sm font-bold">Binding Group {i}</p>
                                      {bg.map((binding, j) => {
                                          const value = getDefaultValue(binding.type, parsed.reflection.structs, true);
                                          return (
                                              <div key={j} className="pl-2">
                                                  <div key={j} className="flex justify-between">
                                                      <p className="text-sm">
                                                          {j}: {binding.name}
                                                      </p>
                                                      <p className="text-sm">{getTypeDisplay(binding.type)}</p>
                                                  </div>
                                                  {value.type === "values" ? (
                                                      <Editor
                                                          height={value.value.split("\n").length * 18}
                                                          defaultLanguage="wgsl"
                                                          defaultValue={value.value}
                                                          options={{
                                                              minimap: {
                                                                  enabled: false,
                                                              },
                                                          }}
                                                      />
                                                  ) : (
                                                      <p className="text-sm italic">{value.value}</p>
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
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

const Container = ({ children, title, className }: PropsWithChildren<{ title: string; className?: string }>) => (
    <div className={"bg-slate-200 p-2 flex flex-col rounded-lg gap-2 " + (className ?? "")}>
        <div className="border-b-1">
            <p className="text-lg font-bold">{title}</p>
        </div>
        {children}
    </div>
);
