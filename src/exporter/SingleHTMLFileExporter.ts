import { FlowData } from "../FlowRunner.js";
import { FileStructureRead } from "../filesystem/FileStructure.js";
import { EventBus } from "../japnaaEngine2d/JaPNaAEngine2d.js";

export class SingleHTMLFileExporter {
    constructor(private fs: FileStructureRead) { }

    public async export(): Promise<Blob> {
        const promises = [];
        const assetFiles: { [x: string]: string } = {};
        const flowFiles: { [x: string]: FlowData } = {};

        for (const flow of await this.fs.listFlows()) {
            promises.push(
                this.fs.getFlow(flow)
                    .then(data => flowFiles[flow] = data)
            );
        }
        for (const asset of await this.fs.listAssets()) {
            promises.push(
                this.fs.getAsset(asset)
                    .then(blob => blob.arrayBuffer())
                    .then(arrayBuffer => assetFiles[asset] = arrayBufferToBase64(arrayBuffer))
            );
        }
        await Promise.all(promises);

        return new Blob([
            "<!DOCTYPE html><html><meta charset=\"UTF-8\"><head><link rel='stylesheet' href='http://localhost:8080/common.css' /><link rel='stylesheet' href='http://localhost:8080/executer.css' /><style>html { position: fixed; width: 100%; height: 100%; } body { margin: 0; padding: 0; overflow: hidden; height: 100vh; background-color: #181818; }</style><title>Flow Editor Export</title></head><body><script>const assets = JSON.parse(",
            JSON.stringify(JSON.stringify(assetFiles)),
            "); const flows = JSON.parse(`",
            JSON.stringify(flowFiles),
            "`);</script><script src='http://localhost:8080/build/executer/index.js' type='module'></script></body></html>"
        ]);
    }
}

export class SingleHTMLFileFileStructure implements FileStructureRead {
    public onReady = new EventBus<void>();

    public isReady(): boolean {
        return true;
    }

    public getAsset(path: string): Promise<Blob> {
        // @ts-expect-error
        return Promise.resolve(base64toBlob(assets[path]));
    }

    public listAssets(): Promise<string[]> {
        // @ts-expect-error
        return Promise.resolve(Object.keys(assets));
    }

    public getStartFlowPath_(): string {
        return "start.json";
    }

    public getFlow(path: string): Promise<FlowData> {
        // @ts-expect-error
        return Promise.resolve(flows[path]);
    }

    public listFlows(): Promise<string[]> {
        // @ts-expect-error
        return Promise.resolve(Object.keys(flows));
    }
}

// Converts an ArrayBuffer directly to base64, without any intermediate 'convert to string then
// use window.btoa' step. According to my tests, this appears to be a faster approach:
// http://jsperf.com/encoding-xhr-image-data/5

/*
MIT LICENSE
Copyright 2011 Jon Leighton
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
function arrayBufferToBase64(arrayBuffer: ArrayBuffer) {
    var base64 = '';
    var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    var bytes = new Uint8Array(arrayBuffer);
    var byteLength = bytes.byteLength;
    var byteRemainder = byteLength % 3;
    var mainLength = byteLength - byteRemainder;

    var a, b, c, d;
    var chunk;

    // Main loop deals with bytes in chunks of 3
    for (var i = 0; i < mainLength; i = i + 3) {
        // Combine the three bytes into a single integer
        chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

        // Use bitmasks to extract 6-bit segments from the triplet
        a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
        b = (chunk & 258048) >> 12; // 258048   = (2^6 - 1) << 12
        c = (chunk & 4032) >> 6; // 4032     = (2^6 - 1) << 6
        d = chunk & 63;               // 63       = 2^6 - 1

        // Convert the raw binary segments to the appropriate ASCII encoding
        base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder == 1) {
        chunk = bytes[mainLength];

        a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

        // Set the 4 least significant bits to zero
        b = (chunk & 3) << 4; // 3   = 2^2 - 1

        base64 += encodings[a] + encodings[b] + '==';
    } else if (byteRemainder == 2) {
        chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

        a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
        b = (chunk & 1008) >> 4; // 1008  = (2^6 - 1) << 4

        // Set the 2 least significant bits to zero
        c = (chunk & 15) << 2; // 15    = 2^4 - 1

        base64 += encodings[a] + encodings[b] + encodings[c] + '=';
    }

    return base64;
}

// From Bacher on StackOverflow: https://stackoverflow.com/a/20151856
function base64toBlob(base64Data: string, contentType?: string) {
    contentType = contentType || '';
    var sliceSize = 1024;
    var byteCharacters = atob(base64Data);
    var bytesLength = byteCharacters.length;
    var slicesCount = Math.ceil(bytesLength / sliceSize);
    var byteArrays = new Array(slicesCount);

    for (var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
        var begin = sliceIndex * sliceSize;
        var end = Math.min(begin + sliceSize, bytesLength);

        var bytes = new Array(end - begin);
        for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
            bytes[i] = byteCharacters[offset].charCodeAt(0);
        }
        byteArrays[sliceIndex] = new Uint8Array(bytes);
    }
    return new Blob(byteArrays, { type: contentType });
}
