import { AnchorButton, Classes } from "@blueprintjs/core";

export const SmallScreenFallback: React.FC = () => (
    <div
        className={`${Classes.DARK} min-h-screen bg-[#1c2127] text-white flex flex-col items-center justify-center gap-6 p-6 text-center`}
    >
        <h1 className="text-2xl font-semibold">WGSL Playground</h1>
        <p className="max-w-md text-slate-300">
            A playground for writing WGSL shaders and running them on the GPU. It needs a larger screen - open it on a
            desktop or laptop, or widen this window.
        </p>
        <img
            src="/screenshot.webp"
            alt="WGSL Playground running the Chasers example: the shader in the editor, its struct layouts, and thousands of points drawing trails on the canvas"
            className="w-full max-w-2xl rounded-lg shadow-2xl"
        />
        <AnchorButton
            icon="git-new-branch"
            text="View Source"
            href="https://github.com/Athenodoros/wgsl-playground"
            variant="outlined"
        />
    </div>
);
