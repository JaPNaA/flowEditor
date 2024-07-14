import path from "path";
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const webpackConfig = {
    mode: "development",
    watch: true, // <- watch files in dev mode
    devtool: "source-map", // <- generate source map in dev mode
    resolve: {
        symlinks: false,
        extensions: [".ts", ".tsx", ".js"],
        extensionAlias: {
            ".js": [".js", ".ts"],
            ".cjs": [".cjs", ".cts"],
            ".mjs": [".mjs", ".mts"]
        }
    },
    module: {
        rules: [
            { test: /\.([cm]?ts|tsx)$/, loader: "ts-loader" }
        ]
    }
};

export default [{
    entry: "./src/editor/index.ts",
    output: {
        filename: "editor-bundle.js",
        path: path.resolve(__dirname, "build")
    },
    ...webpackConfig
}, {
    entry: "./src/executer/index.ts",
    output: {
        filename: "executer-bundle.js",
        path: path.resolve(__dirname, "build")
    },
    ...webpackConfig
}];

