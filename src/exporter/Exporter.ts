import { InMemoryFileSystem } from "../filesystem/FS.js";
import { FileAccessRead } from "../filesystem/FileAccess.js";
import { ExportReadWriter } from "../filesystem/export.js";

export class Exporter {
    private exportFiles = new ExportReadWriter(new InMemoryFileSystem());

    constructor(private files: FileAccessRead) { }

    public async exportToSingleHTML() {
        if (!this.files.isReady) { await this.files.onReady.promise(); }
        if (!this.exportFiles.isReady) { await this.exportFiles.onReady.promise(); }

        const assetsPromise = this.files.listAssets()
            .then(assets => {
                const promises = [];
                for (const asset of assets) {
                    promises.push(
                        this.files.getAsset(asset)
                            .then(blob => this.exportFiles.writeAsset(asset, blob))
                    );
                }
                return Promise.all(promises);
            });
        const flowsPromise = this.files.listFlows()
            .then(flows => {
                const promises = [];
                for (const flow of flows) {
                    promises.push(
                        this.files.getFlow(flow)
                            .then(flowData => this.exportFiles.writeFlow(flow, JSON.stringify(flowData)))
                    );
                }
                return Promise.all(promises);
            });
        await Promise.all([assetsPromise, flowsPromise]);
        await this.exportFiles.flush();
        console.log(this.exportFiles);
    }
}
