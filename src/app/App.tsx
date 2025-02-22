import { useEffect } from "react";
import { useAppState } from "../state";
import { AppNavbar } from "./components/AppNavbar";
import { BindingsDisplay } from "./components/BindingsDisplay";
import { MainEditor } from "./components/MainEditor";
import { RightSection } from "./components/RightSection";
import { RunnableInputs } from "./components/RunnableInputs";
import { RunnableOutputs } from "./components/RunnableOutputs";
import { StructDisplay } from "./components/StructDisplay";

export const App = () => {
    useInitialisedDevice();

    return (
        <div className="h-screen w-screen bg-slate-50 flex flex-col">
            <AppNavbar />
            <div className="flex p-4 gap-4 items-stretch h-screen pt-16.5">
                <MainEditor />
                <RightColumn />
            </div>
        </div>
    );
};

const useInitialisedDevice = () => {
    const setDevice = useAppState((state) => state.setDevice);
    useEffect(() => {
        if (navigator.gpu === undefined) {
            setDevice(null);
            return;
        }

        navigator.gpu.requestAdapter().then(async (adapter) => {
            if (!adapter) {
                setDevice(null);
                return;
            }

            const device = await adapter.requestDevice();
            setDevice(device);
        });
    }, [setDevice]);
};

const RightColumn: React.FC = () => {
    return (
        <div className="w-2xl flex flex-col gap-4">
            <StructDisplay />
            <BindingsDisplay />
            <RightSection title="Function Runner" icon="flow-end">
                <RunnableInputs />
                <RunnableOutputs />
            </RightSection>
        </div>
    );
};
