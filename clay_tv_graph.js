class ClayTVCurrentGraph {
    constructor(scene, signalBuffer, options = {}) {
        this.scene = scene;
        this.signalBuffer = signalBuffer;

        this.rect = options.rect || {
            x: 1840,
            y: 90,
            width: 185,
            height: 125
        };

        this.historyColumns = options.historyColumns || Math.floor(this.rect.width);
        this.padding = options.padding || 6;

        this.lineColor = options.lineColor || 0x66ff99;
        this.meanColor = options.meanColor || 0xffffff;
        this.spikeColor = options.spikeColor || 0xff5577;
        this.bgColor = options.bgColor || 0x07120a;
        this.borderColor = options.borderColor || 0x223322;

        this.alpha = options.alpha ?? 0.95;
        this.showMean = options.showMean ?? true;
        this.showBackground = options.showBackground ?? true;

        this.displayMin = null;
        this.displayMax = null;
        this.scaleSmoothing = options.scaleSmoothing ?? 0.15;

        this.graphics = scene.add.graphics();
        this.graphics.setDepth(options.depth || 50);
    }

    setRect(rect) {
        this.rect = { ...this.rect, ...rect };
        this.historyColumns = Math.floor(this.rect.width);
    }

    update() {
        this.draw();
    }

    draw() {
        const g = this.graphics;
        const buckets = this._getChronologicalBuckets();

        g.clear();

        if (this.showBackground) {
            g.fillStyle(this.bgColor, 0.75);
            g.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);

            g.lineStyle(1, this.borderColor, 0.9);
            g.strokeRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
        }

        if (!buckets.length) {
            this._drawNoSignal();
            return;
        }

        this._updateScale(buckets);

        const inner = this._innerRect();
        const visible = buckets.slice(-this.historyColumns);
        const columnWidth = inner.width / Math.max(1, this.historyColumns - 1);

        for (let i = 0; i < visible.length; i++) {
            const bucket = visible[i];

            // Oldest on left, newest on right
            const x = inner.x + (inner.width - (visible.length - 1 - i) * columnWidth);

            const yMin = this._valueToY(bucket.min, inner);
            const yMax = this._valueToY(bucket.max, inner);
            const yMean = this._valueToY(bucket.mean, inner);

            const color = bucket.spike ? this.spikeColor : this.lineColor;
            const alpha = bucket.spike ? 1.0 : this.alpha;

            g.lineStyle(bucket.spike ? 2 : 1, color, alpha);
            g.beginPath();
            g.moveTo(x, yMin);
            g.lineTo(x, yMax);
            g.strokePath();

            if (this.showMean) {
                g.fillStyle(this.meanColor, 0.75);
                g.fillCircle(x, yMean, bucket.spike ? 1.5 : 1.0);
            }
        }
    }

    _innerRect() {
        return {
            x: this.rect.x + this.padding,
            y: this.rect.y + this.padding,
            width: Math.max(1, this.rect.width - this.padding * 2),
            height: Math.max(1, this.rect.height - this.padding * 2)
        };
    }

    _getChronologicalBuckets() {
        if (!this.signalBuffer) return [];

        const buckets = this.signalBuffer.getBuckets()
            .filter(bucket => bucket !== null && bucket !== undefined);

        // SignalBuffer stores packetIndex, so sorting avoids circular-buffer weirdness.
        buckets.sort((a, b) => (a.packetIndex || 0) - (b.packetIndex || 0));

        return buckets;
    }

    _updateScale(buckets) {
        let min = Infinity;
        let max = -Infinity;

        for (const bucket of buckets) {
            if (Number.isFinite(bucket.min)) min = Math.min(min, bucket.min);
            if (Number.isFinite(bucket.max)) max = Math.max(max, bucket.max);
        }

        if (!Number.isFinite(min) || !Number.isFinite(max)) {
            min = -1;
            max = 1;
        }

        let range = max - min;
        if (range < 1e-9) {
            range = 1;
            min -= 0.5;
            max += 0.5;
        }

        const pad = range * 0.12;
        min -= pad;
        max += pad;

        if (this.displayMin === null || this.displayMax === null) {
            this.displayMin = min;
            this.displayMax = max;
        } else {
            this.displayMin = Phaser.Math.Linear(this.displayMin, min, this.scaleSmoothing);
            this.displayMax = Phaser.Math.Linear(this.displayMax, max, this.scaleSmoothing);
        }
    }

    _valueToY(value, inner) {
        const min = this.displayMin ?? -1;
        const max = this.displayMax ?? 1;
        const range = Math.max(1e-9, max - min);

        const t = Phaser.Math.Clamp((value - min) / range, 0, 1);

        // Higher values go upward on screen
        return inner.y + inner.height * (1 - t);
    }

    _drawNoSignal() {
        const g = this.graphics;
        const inner = this._innerRect();

        g.lineStyle(1, this.lineColor, 0.35);

        const midY = inner.y + inner.height / 2;
        g.beginPath();
        g.moveTo(inner.x, midY);
        g.lineTo(inner.x + inner.width, midY);
        g.strokePath();
    }

    destroy() {
        if (this.graphics) {
            this.graphics.destroy();
            this.graphics = null;
        }
    }
}