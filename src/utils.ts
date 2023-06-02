export function isAncestor(child: Node | null, ancestor: Node): boolean {
    let curr = child;
    while (curr) {
        if (curr === ancestor) { return true; }
        curr = curr.parentNode;
    }
    return false;
}

export function getAncestorWhich(child: Node | null, test: (node: Node) => boolean): Node | null {
    let curr = child;
    while (curr) {
        if (test(curr)) { return curr; }
        curr = curr.parentNode;
    }
    return null;
}

export function download(blob: Blob, name: string) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function requestFile() {
    const input = document.createElement("input");
    input.type = "file";
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
    return new Promise<File>((res, rej) => {
        input.addEventListener("change", () => {
            const files = input.files;
            if (!files) { rej(); return; }
            res(files[0])
        });
    });
}

export function stringToBlob(string: string) {
    const array = new Uint8Array(string.length);
    for (let i = 0; i < string.length; i++) {
        array[i] = string.charCodeAt(i);
    }
    return new Blob([array]);
}
