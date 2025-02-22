import { Section, Tag } from "@blueprintjs/core";
import { Editor } from "@monaco-editor/react";
import { useAppState } from "../../state";
import { INITIAL_APP_STATE } from "../../state/defaults";

export const MainEditor: React.FC = () => {
    const setWGSL = useAppState((state) => state.setWGSL);
    const error = useAppState((state) => (state.type === "failed-parse" ? state.error : null));

    return (
        <div className="basis-md grow flex flex-col gap-4">
            <Section
                title="Editor"
                className="grow shrink flex flex-col"
                rightElement={
                    <Tag intent={error ? "danger" : "success"} minimal={true} large={true} className="!max-w-96">
                        {error ? error : "Parsing Successful"}
                    </Tag>
                }
            >
                <div className="bg-slate-200 p-2 grow shrink">
                    <Editor defaultLanguage="wgsl" defaultValue={INITIAL_APP_STATE.wgsl} onChange={setWGSL} />
                </div>
            </Section>
        </div>
    );
};
