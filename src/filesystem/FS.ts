/**
 * (My) FileSystem, readonly.
 * 
 * Note that all paths do not end in a trailing connector. (For example,
 * 'path/to/directory' is allowed, but 'path/to/directory/' is not.)
 */
export interface FSRead {
    /**
     * The name is usually the base of the directory. For example, if the object
     * is based on "/home/username/Documents", then the name is "/home/username/Documents"
     */
    name: string;

    /**
     * Read a file at the path.
     * 
     * @param path Path from base
     */
    read(path: string): Promise<Blob>;

    /**
     * Change the root directory for this object.
     * 
     * For example, `cd(path).read(name)` is equivalent to `read(join(path, name))`
     * 
     * @param path Path to rebase to
     */
    cd(path: string): Promise<FSRead>;

    /**
     * Join paths such that for `paths = [path1, path2, ...]`,
     * `cd(path1).cd(path2). ...` is equivalent to `cd(join(paths))`
     * 
     * In most file systems, this is `path1 + '/' + path2 + ...`
     * 
     * @param paths List of path parts
     */
    join(...paths: string[]): string;
}

/**
 * (My) FileSystem, read and write
 * 
 * Note that all paths do not end in a trailing connector. (For example,
 * 'path/to/directory' is allowed, but 'path/to/directory/' is not.)
 */
export interface FSReadWrite extends FSRead {
    cd(path: string,): Promise<FSReadWrite>;

    /**
     * Retrieve the last modified unix (millisecond) timestamp of a file. This
     * information may not be available in some file systems, so the function
     * may return `null`.
     * 
     * lastModified is required for FSReadWrite but not FSRead since there
     * is no use for lastModified in read-only fileSystems.
     * 
     * @param path Path to file
     */
    lastModified(path: string): Promise<number | null>;

    /**
     * Get a list of files and directories under a directory.
     * @param dir Path to directory.
     */
    ls(dir: string): Promise<FSReference[]>;

    /**
     * Write content to some file. Will overwrite existing files in the same
     * path and also create parent directories if needed.
     * @param path Path of file
     * @param blob Content of file to write
     */
    write(path: string, blob: Blob): Promise<void>;

    /**
     * Moves an item (file or directory) from an original path to a new path.
     * 
     * Will overwrite files or directories on the destination path.
     * 
     * Note: `mv(file, directory)` will delete the directory and replace it
     * with the file.
     * 
     * @param from Original item location
     * @param to New item location
     */
    mv(from: string, to: string): Promise<void>;

    /**
     * Removes an item (file or directory) at the specified path.
     * Will recursively remove directories and directory contents.
     * @param path Path of item
     */
    rm(path: string): Promise<void>;

    /**
     * Create an empty directory at the specified path. Will overwrite files
     * at the same path.
     * @param path Path to directory.
     */
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

export class NetworkFileSystem implements FSRead {
    public name: string;

    constructor(private baseUrl: string) {
        this.name = baseUrl;
    }

    public join(...paths: string[]): string {
        return paths.filter(x => x).join("/");
    }

    public async read(path: string): Promise<Blob> {
        return fetch(this.join(this.baseUrl, path))
            .then(res => res.blob());
    }

    public async cd(path: string) {
        return new NetworkFileSystem(this.join(this.baseUrl, path));
    }
}

export class InMemoryFileSystem implements FSReadWrite {
    public name: string;
    private files = new Map<string, Blob | InMemoryFileSystem>();

    constructor() {
        this.name = "InMemoryFileSystem";
    }

    public join(...paths: string[]): string {
        return paths.filter(x => x).join("/");
    }

    public async read(path: string): Promise<Blob> {
        const [dir, fileName] = await this.resolveParentDir(path);
        const file = dir.files.get(fileName);
        if (file instanceof Blob) {
            return file;
        } else {
            throw new Error("File not found");
        }
    }

    public async lastModified(path: string): Promise<number | null> {
        return null;
    }

    public async ls(path: string): Promise<FSReference[]> {
        const dir = await this.resolveDirectory(path);
        const items: FSReference[] = [];
        for (const [name, file] of dir.files) {
            items.push({
                type: file instanceof Blob ? "file" : "directory",
                name,
                path: this.join(path, name)
            });
        }
        return items;
    }

    public async cd(path: string) {
        return this.resolveDirectory(path);
    }

    public async write(path: string, blob: Blob): Promise<void> {
        const [parentDir, fileName] = await this.resolveParentDir(path, { create: true });
        parentDir.files.set(fileName, blob);
    }

    public async mv(from: string, to: string): Promise<void> {
        const [fromDir, fromName] = await this.resolveParentDir(from);
        const [toDir, toName] = await this.resolveParentDir(to, { create: true });
        toDir.files.set(toName, fromDir.files.get(fromName)!);
        fromDir.files.delete(fromName);
    }

    public async rm(path: string): Promise<void> {
        const [parentDir, fileName] = await this.resolveParentDir(path);
        parentDir.files.delete(fileName);
    }

    public async mkdir(path: string): Promise<void> {
        await this.resolveDirectory(path, { create: true });
    }

    private async resolveParentDir(path: string, options?: { create: boolean }): Promise<[InMemoryFileSystem, string]> {
        const parts = path.split("/");
        const fileName = parts.pop();
        if (!fileName) { throw new Error("Invalid path"); }
        return [await this.resolveDirectory(parts.join("/"), options), fileName];
    }

    private async resolveDirectory(path: string, options?: { create: boolean }): Promise<InMemoryFileSystem> {
        if (!path) { return this; }
        const parts = path.split("/");
        let curr: InMemoryFileSystem = this;
        for (const part of parts) {
            const next = curr.files.get(part);
            if (next instanceof InMemoryFileSystem) {
                curr = next;
            } else if (options?.create) {
                const newDir = new InMemoryFileSystem();
                curr.files.set(part, newDir);
                curr = newDir;
            } else {
                throw new Error("Can't find directory");
            }
        }
        return curr;
    }
}
