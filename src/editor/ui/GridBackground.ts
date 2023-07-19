import { WorldElm } from "../../japnaaEngine2d/JaPNaAEngine2d.js";

// reused from https://github.com/JaPNaA/Thingy_2021/blob/master/physicsSimulationLibrary/engine/components/Grid.js
export class GridBackground extends WorldElm {
    constructor() {
        super();
    }

    draw() {
        this.drawGridCellSize(10000);
        this.drawGridCellSize(1000);
        this.drawGridCellSize(100);
    }

    private drawGridCellSize(scaleSize: number) {
        const X = this.engine.canvas.X;

        const cellSize = this.calculateCellSize(scaleSize);
        const scale = this.engine.camera.getScale();

        const offsetX = -this.engine.camera.rect.x % cellSize;
        const offsetY = -this.engine.camera.rect.y % cellSize;
        const gridWidth = this.engine.camera.rect.width;
        const gridHeight = this.engine.camera.rect.height;

        X.save();
        X.translate(this.engine.camera.rect.x, this.engine.camera.rect.y);
        X.strokeStyle = "#aaffff";
        X.lineWidth = 0.5 / this.engine.camera.getScale();
        X.globalAlpha = Math.min((scale * cellSize / 500) ** 0.5 * 0.3, 0.3);
        X.globalCompositeOperation = "destination-over";
        X.beginPath();

        for (let x = offsetX; x < gridWidth; x += cellSize) {
            X.moveTo(x, 0);
            X.lineTo(x, gridHeight);
        }

        for (let y = offsetY; y < gridHeight; y += cellSize) {
            X.moveTo(0, y);
            X.lineTo(gridWidth, y);
        }

        X.stroke();
        X.restore();
    }

    private calculateCellSize(scaleSize: number) {
        const scale = this.engine.camera.getScale();
        return scaleSize * (
            Math.pow(
                10,
                Math.floor(
                    -Math.log10(scale)
                )
            )
        );
    }
}
