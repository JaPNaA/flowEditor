const path = require("path");

const webpackConfig = {
    mode: "development",
    watch: true,
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

module.exports = [{
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

