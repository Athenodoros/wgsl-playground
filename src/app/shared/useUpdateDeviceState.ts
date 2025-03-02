import { useEffect } from "react";
import { useAppState } from "../../state";

export const useUpdateDeviceState = () => {
    const setDevice = useAppState((state) => state.setDevice);
    useEffect(() => {
        if (navigator.gpu === undefined) {
            setDevice(null);
            return;
        }

        let cancelled = false;

        navigator.gpu.requestAdapter().then(async (adapter) => {
            if (!adapter) {
                setDevice(null);
                return;
            }

            const device = await adapter.requestDevice();

            if (cancelled) return;
            setDevice(device);
        });

        return () => {
            cancelled = true;
        };
    }, [setDevice]);
};
