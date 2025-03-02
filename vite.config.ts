import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

// https://vite.dev/config/
export default defineConfig({
    base: "/wgsl-playground/",
    plugins: [react(), tailwindcss(), glsl()],
});
