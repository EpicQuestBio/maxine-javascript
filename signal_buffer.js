class SignalBuffer {
    constructor(options = {}) {
        this.maxBuckets = options.maxBuckets || 300;
        this.debug = !!options.debug;
        this.logEvery = options.logEvery || 60;

        this.presentBox = 0;
        this.packetCount = 0;

        this.buckets = new Array(this.maxBuckets).fill(null);

        this.ringBaseline = 0;
        this.minSeen = null;
        this.maxSeen = null;

        this.pendingSpikeEvents = 0;
        this.lastPacketHadSpike = false;
        this.lastPacketSummary = null;

        this.recentSpikeFlags = [];
        this.recentSpanValues = [];
        this.recentHistoryMax = options.recentHistoryMax || 12;
    }

    clear() {
        this.presentBox = 0;
        this.packetCount = 0;
        this.buckets.fill(null);

        this.ringBaseline = 0;
        this.minSeen = null;
        this.maxSeen = null;

        this.pendingSpikeEvents = 0;
        this.lastPacketHadSpike = false;
        this.lastPacketSummary = null;

        this.recentSpikeFlags = [];
        this.recentSpanValues = [];
    }

    applyTick(tick) {
        const ig = tick.interval_graph || {};
        const bars = Array.isArray(ig.bars) ? ig.bars : [];
        if (!bars.length) return null;

        this.packetCount += 1;

        const bucket = this._makePacketBucket(tick, bars, ig);
        if (!bucket) return null;

        this.buckets[this.presentBox] = bucket;

        if (bucket.spike) {
            this.pendingSpikeEvents += 1;
            this.lastPacketHadSpike = true;
        } else {
            this.lastPacketHadSpike = false;
        }

        this._updateRecentHistory(bucket);
        this._recomputeExtents();
        this._updateLastPacketSummary(bucket, bars);

        this.presentBox = (this.presentBox + 1) % this.maxBuckets;

        if (this.debug && this.packetCount % this.logEvery === 0) {
            this.logStatus();
        }

        return bucket;
    }

    _makePacketBucket(tick, bars, ig) {
        let packetBaseline = Number(ig.baseline);

        if (!Number.isFinite(packetBaseline)) {
            let sum = 0;
            let n = 0;

            for (let i = 0; i < bars.length; i++) {
                const m = Number(bars[i].mean);
                if (Number.isFinite(m)) {
                    sum += m;
                    n++;
                }
            }

            packetBaseline = n > 0 ? sum / n : 0;
        }

        if (!Number.isFinite(this.ringBaseline)) {
            this.ringBaseline = packetBaseline;
        }

        this.ringBaseline = (0.85 * this.ringBaseline) + (0.15 * packetBaseline);

        let aggMin = null;
        let aggMax = null;
        let meanSum = 0;
        let meanCount = 0;
        let anySpike = false;

        for (let i = 0; i < bars.length; i++) {
            const b = bars[i];
            const bMin = Number(b.min);
            const bMax = Number(b.max);
            const bMean = Number(b.mean);

            if (Number.isFinite(bMin)) {
                if (aggMin === null || bMin < aggMin) aggMin = bMin;
            }

            if (Number.isFinite(bMax)) {
                if (aggMax === null || bMax > aggMax) aggMax = bMax;
            }

            if (Number.isFinite(bMean)) {
                meanSum += bMean;
                meanCount++;
            }

            if (b.spike) {
                anySpike = true;
            }
        }

        if (aggMin === null || aggMax === null) return null;

        const aggMean = meanCount > 0 ? meanSum / meanCount : (aggMin + aggMax) / 2;
        const aggSpan = Math.max(0, aggMax - aggMin);

        return {
            ts: tick.ts || Date.now(),
            source: tick.source || "unknown",
            packetIndex: this.packetCount,

            min: aggMin,
            max: aggMax,
            mean: aggMean,
            span: aggSpan,
            spike: anySpike,

            baseline: this.ringBaseline,
            rawBars: bars
        };
    }

    _updateRecentHistory(bucket) {
        this.recentSpikeFlags.push(bucket.spike ? 1 : 0);
        this.recentSpanValues.push(bucket.span);

        if (this.recentSpikeFlags.length > this.recentHistoryMax) {
            this.recentSpikeFlags.shift();
        }

        if (this.recentSpanValues.length > this.recentHistoryMax) {
            this.recentSpanValues.shift();
        }
    }

    _recomputeExtents() {
        let minSeen = null;
        let maxSeen = null;

        for (let i = 0; i < this.buckets.length; i++) {
            const bucket = this.buckets[i];
            if (!bucket) continue;

            if (minSeen === null || bucket.min < minSeen) minSeen = bucket.min;
            if (maxSeen === null || bucket.max > maxSeen) maxSeen = bucket.max;
        }

        this.minSeen = minSeen;
        this.maxSeen = maxSeen;
    }

    _updateLastPacketSummary(bucket, bars) {
        let spikeCount = 0;
        for (let i = 0; i < this.recentSpikeFlags.length; i++) {
            spikeCount += this.recentSpikeFlags[i];
        }

        const persistence = this.recentSpikeFlags.length > 0
            ? spikeCount / this.recentSpikeFlags.length
            : 0;

        let maxRecentSpan = 1e-6;
        for (let i = 0; i < this.recentSpanValues.length; i++) {
            if (this.recentSpanValues[i] > maxRecentSpan) {
                maxRecentSpan = this.recentSpanValues[i];
            }
        }

        const spanNorm = Phaser.Math.Clamp(bucket.span / maxRecentSpan, 0, 1);

        this.lastPacketSummary = {
            hadSpike: !!bucket.spike,
            span: bucket.span,
            spanNorm,
            persistence,
            mean: bucket.mean,
            min: bucket.min,
            max: bucket.max,
            spikeCount,
            barCount: bars.length,
            source: bucket.source,
            packetIndex: bucket.packetIndex
        };
    }

    getBucket(slot) {
        return this.buckets[slot] || null;
    }

    getBuckets() {
        return this.buckets;
    }

    getPresentBox() {
        return this.presentBox;
    }

    getExtents() {
        return {
            min: this.minSeen,
            max: this.maxSeen,
            baseline: this.ringBaseline
        };
    }

    getLastPacketSummary() {
        return this.lastPacketSummary;
    }

    consumePendingSpikeEvents(maxCount) {
        if (!Number.isFinite(maxCount)) {
            maxCount = this.pendingSpikeEvents;
        }

        maxCount = Math.max(0, Math.floor(maxCount));
        const n = Math.min(this.pendingSpikeEvents, maxCount);
        this.pendingSpikeEvents -= n;
        return n;
    }

    clearPendingSpikeEvents() {
        this.pendingSpikeEvents = 0;
    }

    logStatus() {
        console.log("SignalBuffer", {
            packetCount: this.packetCount,
            presentBox: this.presentBox,
            extents: this.getExtents(),
            latestSummary: this.lastPacketSummary,
            latestBucket: this.buckets[(this.presentBox - 1 + this.maxBuckets) % this.maxBuckets]
        });
    }
}