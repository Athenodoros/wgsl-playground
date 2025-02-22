import { create } from "zustand";
import { getAppActions } from "./actions";
import { INITIAL_APP_STATE } from "./defaults";
import { AppActions, AppState } from "./types";

export const useAppState = create<AppState & AppActions>()((set, get) => ({
    ...INITIAL_APP_STATE,
    ...getAppActions(set, get),
}));

Object.assign(window, useAppState);
