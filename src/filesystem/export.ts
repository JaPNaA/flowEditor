import { FlowData } from "../FlowRunner.js";
import { EventBus } from "../japnaaEngine2d/JaPNaAEngine2d.js";
import { removeElmFromArray } from "../japnaaEngine2d/util/removeElmFromArray.js";
import { FSRead, FSReadWrite } from "./FS.js";
import { FileStructureRead, FileStructureReadWrite } from "./FileStructure.js";

export class ExportReader<T extends FSRead = FSRead> implements FileStructureRead {
    public onReady = new EventBus<void>();

    protected static assetsListPath = "assetsList.txt";
    protected static assetsPath = "assets";
    protected static startFlowName = "0.json";
    protected static flowListPath = "flowsList.txt";
    protected static flowPath = "flow";

    protected ready = true;

    constructor(protected fs: T) { }

    public isReady(): boolean {
        return this.ready;
    }

    public async getAsset(path: string): Promise<Blob> {
        return this.fs.read(this.fs.join(ExportReader.assetsPath, path));
    }

    public async listAssets(): Promise<string[]> {
        const file = await this.fs.read(ExportReader.assetsListPath);
        const text = await file.text();
        return text.split("\n");
    }

    public getStartFlowPath_(): string {
        return ExportReader.startFlowName;
    }

    public async getFlow(path: string): Promise<FlowData> {
        return JSON.parse(
            await this.fs.read(this.fs.join(ExportReader.flowPath, path))
                .then(file => file.text())
        );
    }

    public async listFlows(): Promise<string[]> {
        const file = await this.fs.read(ExportReader.flowListPath);
        const text = await file.text();
        return text.split("\n").filter(x => x);
    }
}

export class ExportReadWriter extends ExportReader<FSReadWrite> implements FileStructureReadWrite {
    private assetList!: string[];
    private flowsList!: string[];

    constructor(fs: FSReadWrite) {
        super(fs);
        this.ready = false;
        Promise.all([
            this.loadAssetListToCache(),
            this.loadFlowListToCache()
        ]).then(() => {
            this.ready = true;
            this.onReady.send();
        });
    }

    public async listAssets(): Promise<string[]> {
        return this.assetList;
    }

    public async writeAsset(path: string, blob: Blob): Promise<void> {
        if (!this.assetList.includes(path)) {
            this.assetList.push(path);
        }
        await this.fs.write(this.fs.join(ExportReader.assetsPath, path), blob);
    }

    public moveAsset(pathFrom: string, pathTo: string): Promise<void> {
        removeElmFromArray(pathFrom, this.assetList);
        this.assetList.push(pathTo);
        return this.fs.mv(
            this.fs.join(ExportReader.assetsPath, pathFrom),
            this.fs.join(ExportReader.assetsPath, pathTo)
        );
    }

    public removeAsset(path: string): Promise<void> {
        removeElmFromArray(path, this.assetList);
        return this.fs.rm(
            this.fs.join(ExportReader.assetsPath, path)
        );
    }

    public writeFlow(path: string, data: string): Promise<void> {
        if (!this.flowsList.includes(path)) {
            this.flowsList.push(path);
        }
        return this.fs.write(this.fs.join(ExportReader.flowPath, path), new Blob([data]));
    }

    public moveFlow(pathFrom: string, pathTo: string): Promise<void> {
        removeElmFromArray(pathFrom, this.flowsList);
        this.flowsList.push(pathTo);
        return this.fs.mv(
            this.fs.join(ExportReader.flowPath, pathFrom),
            this.fs.join(ExportReader.flowPath, pathTo)
        );
    }

    public removeFlow(path: string): Promise<void> {
        removeElmFromArray(path, this.flowsList);
        return this.fs.rm(
            this.fs.join(ExportReader.flowPath, path)
        );
    }

    public async flush() {
        if (this.assetList) {
            await this.fs.write(ExportReader.assetsListPath, new Blob([this.assetList.join("\n")]));
        }
        if (this.flowsList) {
            await this.fs.write(ExportReader.flowListPath, new Blob([this.flowsList.join("\n")]));
        }
    }

    private async loadAssetListToCache() {
        if (this.assetList) { return; }
        this.assetList = [];
        const text = await this.readOrCreate(ExportReader.assetsListPath).then(blob => blob.text());
        this.assetList = text.split("\n").filter(x => x);
    }

    private async loadFlowListToCache() {
        if (this.flowsList) { return; }
        this.flowsList = [];
        const text = await this.readOrCreate(ExportReader.flowListPath).then(blob => blob.text());
        this.flowsList = text.split("\n").filter(x => x);
    }

    private async readOrCreate(path: string): Promise<Blob> {
        try {
            return await this.fs.read(path);
        } catch (err) {
            const newBlob = new Blob();
            await this.fs.write(path, newBlob);
            return newBlob;
        }
    }
}