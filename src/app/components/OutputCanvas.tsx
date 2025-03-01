import { CSSProperties, useCallback, useState } from "react";
import { useAppState } from "../../state";

const SCALING = window.devicePixelRatio || 1;
const CANVAS_WIDTH = 640;
const CANVAS_WIDTH_PX = CANVAS_WIDTH * SCALING;
const CANVAS_HEIGHT = 360;
const CANVAS_HEIGHT_PX = CANVAS_HEIGHT * SCALING;

export const OutputCanvas: React.FC<{ hidden?: boolean }> = ({ hidden }) => {
    const setCanvas = useAppState((state) => state.setCanvas);
    const results = useAppState((state) => (state.type === "finished" ? state.results : null));

    const [popover, setPopover] = useState<{
        styles: CSSProperties;
        rgba: [number, number, number, number];
        coords: [number, number];
    } | null>(null);

    const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            if (results?.type !== "outputs" || !results.getTextureValue) return;

            const rgba = results.getTextureValue(
                event.nativeEvent.offsetY * SCALING,
                event.nativeEvent.offsetX * SCALING
            );

            if (rgba === null) {
                setPopover(null);
                return;
            }

            const styles: CSSProperties = {};
            if (event.nativeEvent.offsetX > 0.65 * CANVAS_WIDTH)
                styles.right = CANVAS_WIDTH - event.nativeEvent.offsetX + 10;
            else styles.left = event.nativeEvent.offsetX + 10;
            if (event.nativeEvent.offsetY > 0.75 * CANVAS_HEIGHT)
                styles.bottom = CANVAS_HEIGHT - event.nativeEvent.offsetY + 5;
            else styles.top = event.nativeEvent.offsetY + 5;

            const coords = [
                (event.nativeEvent.offsetX / CANVAS_WIDTH) * 2 - 1,
                1 - (event.nativeEvent.offsetY / CANVAS_HEIGHT) * 2,
            ] as [number, number];

            setPopover({ styles, rgba, coords });
        },
        [results]
    );

    const handleMouseLeave = useCallback(() => setPopover(null), []);

    return (
        <div className={hidden ? "hidden" : "self-center flex flex-col"}>
            <div className="flex justify-between">
                <pre className="!text-xs text-slate-500 italic">(-1, 1)</pre>
                <pre className="!text-xs text-slate-500 italic">(1, 1)</pre>
            </div>
            <div className="relative border-solid border-2 border-slate-300">
                <canvas
                    className={`h-[360px] w-[640px]`} // Needs to be explicit so tailwind includes the classes - should be in sync with variables above
                    width={CANVAS_WIDTH_PX}
                    height={CANVAS_HEIGHT_PX}
                    ref={setCanvas}
                    onMouseMove={handleMouseMove}
                    onMouseOut={handleMouseLeave}
                />
                {popover && (
                    <div className="absolute bg-white rounded-md p-2 pl-1 pointer-events-none" style={popover.styles}>
                        <p
                            className="text-black !mb-0 border-l-4 border-slate-200 pl-1"
                            style={
                                popover.rgba[3] === 0 ? undefined : { borderColor: `rgba(${popover.rgba.join(", ")})` }
                            }
                        >
                            Coords: ({popover.coords.map((coord) => coord.toFixed(2)).join(", ")})
                        </p>
                        <p
                            className="text-black !mb-0 border-l-4 border-slate-200 pl-1"
                            style={
                                popover.rgba[3] === 0 ? undefined : { borderColor: `rgba(${popover.rgba.join(", ")})` }
                            }
                        >
                            {popover.rgba[3] === 0
                                ? "Transparent"
                                : `RGBA(${popover.rgba.map((v) => (v / 255).toFixed(2)).join(", ")})`}
                        </p>
                    </div>
                )}
            </div>
            <div className="flex justify-between">
                <pre className="!text-xs text-slate-500 italic">(-1, -1)</pre>
                <pre className="!text-xs text-slate-500 italic">(1, -1)</pre>
            </div>
        </div>
    );
};
