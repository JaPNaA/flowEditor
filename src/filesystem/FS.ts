/** (My) FileSystem, readonly */
export interface FSRead {
    name: string;
    read(path: string): Promise<Blob>;
    cd(path: string): Promise<FSRead>;
    join(...paths: string[]): string;
}

/** (My) FileSystem, read and write */
export interface FSReadWrite extends FSRead {
    cd(path: string,): Promise<FSReadWrite>;

    // is also 'readonly', but should not be required for executing flows
    lastModified(path: string): Promise<number | null>;
    ls(dir: string): Promise<FSReference[]>;

    write(path: string, blob: Blob): Promise<void>;
    mv(from: string, to: string): Promise<void>;
    rm(path: string): Promise<void>;
    mkdir(path: string): Promise<void>;
}

/** (My) FileSystem, item */
type FSReference = FSDirReference | FSFileReference;

export interface FSFileReference {
    type: "file";
    name: string;
    path: string;
}

export interface FSDirReference {
    type: "directory";
    name: string;
    path: string;
}

/**
 * implementation of FSReadWrite using the File Access API
 */
export class FileAccessAPIFileSystem implements FSReadWrite {
    public name: string;

    constructor(private directoryHandle: FileSystemDirectoryHandle) {
        this.name = directoryHandle.name;
    }

    public join(...paths: string[]): string {
        return paths.filter(x => x).join("/");
    }

    public async read(path: string): Promise<Blob> {
        return await this.resolveFileHandle(path)
            .then(handle => handle.getFile())
    }

    public async lastModified(path: string): Promise<number | null> {
        return this.resolveFileHandle(path)
            .then(handle => handle.getFile())
            .then(file => file.lastModified);
    }

    public async ls(dir: string): Promise<FSReference[]> {
        const handle = await this.resolveDirectoryHandle(dir);
        const items = [];
        for await (const entry of handle.values()) {
            items.push({
                type: entry.kind,
                name: entry.name,
                path: dir ? dir + "/" + entry.name : entry.name
            });
        }
        return items;
    }

    public async cd(path: string) {
        return new FileAccessAPIFileSystem(await this.resolveDirectoryHandle(path));
    }

    public async write(path: string, blob: Blob): Promise<void> {
        const handle = await this.resolveFileHandle(path, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        return writable.close();
    }

    public async mv(from: string, to: string): Promise<void> {
        const handle = await this.resolveFileHandle(from);
        // @ts-ignore -- not defined in Global.d.ts, but exists in chrome
        return handle.move(to);
    }

    public async rm(path: string): Promise<void> {
        const handle = await this.resolveFileHandle(path);
        // @ts-ignore -- not defined in Global.d.ts, but exists in chrome
        return handle.remove();
    }

    public async mkdir(path: string): Promise<void> {
        await this.directoryHandle.getDirectoryHandle(path, { create: true });
    }

    private async resolveFileHandle(path: string, options?: { create: boolean }): Promise<FileSystemFileHandle> {
        const parts = path.split("/");
        const fileName = parts.pop();
        if (!fileName) { throw new Error("Invalid path"); }
        let curr = this.directoryHandle;
        for (const part of parts) {
            curr = await curr.getDirectoryHandle(part, options);
        }
        return curr.getFileHandle(fileName, options);
    }

    private async resolveDirectoryHandle(path: string, options?: { create: boolean }): Promise<FileSystemDirectoryHandle> {
        if (!path) { return this.directoryHandle; }
        const parts = path.split("/");
        let curr = this.directoryHandle;
        for (const part of parts) {
            curr = await curr.getDirectoryHandle(part, options);
        }
        return curr;
    }
}
