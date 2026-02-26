
// Used by the signal ring. It's based on the signal ring's size
// rather than the torus's size.
function adjustCoordsRing(x, y) {
	const widthToHeightRatio = ringWidth / ringHeight

	var newx, newy

	newx = widthToHeightRatio * x + worldCenter[0]
	newy = y + worldCenter[1]

	return [newx, newy]
}


class RandomVerticalLineRing {
	constructor() {
		this.presentBox = 0
		this.lineExtent = 25

		this.fakeTops = []
		for (var i = 0; i < numBoxes; i++) {
			this.fakeTops.push(Math.floor(Math.random() * (this.lineExtent + 1)));
		}
		this.fakeBottoms = []
		for (var i = 0; i < numBoxes; i++) {
			this.fakeBottoms.push(Math.floor(Math.random() * (-this.lineExtent - 1)));
		}

		this.spikeAtBox = new Array(numBoxes).fill(false);
	}

	advanceOneFrame() {
		this.presentBox = (this.presentBox + 1) % numBoxes;
		this.tops = this.fakeTops;
		this.bottoms = this.fakeBottoms;

		this.tops[this.presentBox] = Math.floor(Math.random() * (this.lineExtent + 1));

		this.bottoms[this.presentBox] = Math.floor(Math.random() * (this.lineExtent + 1));

		this.spikeAtBox[(this.presentBox + 1) % numBoxes] = false;
	}

	addSpike() {
		this.spikeAtBox[this.presentBox] = true;  // spike at the current cursor location
		//console.log("adding spike to " + this.presentBox);
	}

	draw(graphics) {
		// Draw the vertical lines
		for (var i = 0; i < numBoxes; i++) {
			var color;
			if (this.spikeAtBox[i] == true) {
				//console.log("Drawing spike at " + i)
				color = 0xffffff;
			} else {
				color = 0xff00ff;
			}
			var top = this.tops[i];
			var bottom = this.bottoms[i];

			var angle = (i * 360 / numBoxes) % 360;
			this.drawLine(graphics, angle, top, bottom, color);
		}
		//this.drawLine(graphics, this.getPresentAngle(), -2 * this.lineExtent, 0, 0x00bbbb);
	}

	getPresentAngle() {
		return this.presentBox * 360 / numBoxes;
	}

	drawLine(graphics, theta, top, bottom, color) {
		// Calculate the coordinates for the inner end of the line
		var r = ringRadius + top;
		var unadjustedInnerXY = pol2cart(r, theta);
		var innerX = unadjustedInnerXY[0];
		var innerY = unadjustedInnerXY[1];
		var innerCoords = adjustCoordsRing(innerX, innerY);

		// Calculate the coordinates for the outer end of the line
		var r2 = ringRadius + bottom;
		var outerX, outerY;
		[outerX, outerY] = pol2cart(r2, theta);
		var outerCoords = adjustCoordsRing(outerX, outerY);

		graphics.lineStyle(4, color);
		graphics.lineBetween(innerCoords[0], innerCoords[1], outerCoords[0], outerCoords[1]);

		// Oops don't remember what this bit does except slow it down
		//for (var x = 0, y = 0; x < 1000, y < 1000; x++, y++) {
		//	graphics.fillCircle(x, y, 1);
		//}
	}
}

class VerticalLineRing {
	// Live signal ring fed by the Python WebSocket server.
	// Fixed slots around the ellipse; new packets write into the next slot(s).
	// Public methods kept compatible with existing game loop calls.
	constructor() {
		this.presentBox = 0;         // moving cursor / write head
		this.lineExtent = 25;

		// Raw values stored per slot (relative to baseline-independent raw signal values)
		this.rawTop = new Array(numBoxes).fill(0);      // interval max
		this.rawBottom = new Array(numBoxes).fill(0);   // interval min
		this.rawMean = new Array(numBoxes).fill(0);
		this.hasData = new Array(numBoxes).fill(false);

		// Display values (scaled to lineExtent after global rescale)
		this.tops = new Array(numBoxes).fill(0);
		this.bottoms = new Array(numBoxes).fill(0);

		// Spike flags and optional local flashes
		this.spikeAtBox = new Array(numBoxes).fill(false);
		this.localSpikeDecay = new Array(numBoxes).fill(0);

		// Scaling state for whole ring
		this.ringBaseline = 0;
		this.ringMinSeen = null;
		this.ringMaxSeen = null;

		// Connection state
		this.connected = false;
		this.lastPacketTs = 0;
		this.lastSource = "none";
		this.lastError = "";
		this.wsUrl = "ws://localhost:8766";
		this.ws = null;

		// How many ring slots to consume per incoming packet bar
		// 1 = one interval bar advances one ring slot.
		this.writeStride = 1;
	}

	setServerUrl(url) {
		if (typeof url === "string" && url.trim().length > 0) {
			this.wsUrl = url.trim();
		}
	}

	connect(url) {
		if (url) this.setServerUrl(url);

		if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
			return;
		}

		try {
			this.ws = new WebSocket(this.wsUrl);
		} catch (e) {
			this.lastError = String(e);
			this.connected = false;
			this.ws = null;
			return;
		}

		this.ws.onopen = () => {
			this.connected = true;
			this.lastError = "";
		};

		this.ws.onclose = () => {
			this.connected = false;
			this.ws = null;
		};

		this.ws.onerror = () => {
			this.lastError = "WebSocket error";
			this.connected = false;
		};

		this.ws.onmessage = (ev) => {
			let msg;
			try {
				msg = JSON.parse(ev.data);
			} catch (e) {
				return;
			}
			if (msg.type === "mq_tick") {
				this.applyTick(msg);
			}
		};
	}

	disconnect() {
		if (this.ws) {
			try { this.ws.close(); } catch (e) {}
		}
		this.ws = null;
		this.connected = false;
	}

	// --- Core behavior: fixed slots + moving cursor ---
	applyTick(tick) {
		this.lastPacketTs = Date.now();
		this.lastSource = tick.source || "unknown";

		const ig = tick.interval_graph || {};
		const bars = Array.isArray(ig.bars) ? ig.bars : [];
		if (!bars.length) return;

		// Use server-provided baseline if available; otherwise derive from bars
		let packetBaseline = Number(ig.baseline);
		if (!Number.isFinite(packetBaseline)) {
			let sum = 0, n = 0;
			for (let i = 0; i < bars.length; i++) {
				const m = Number(bars[i].mean);
				if (Number.isFinite(m)) { sum += m; n++; }
			}
			packetBaseline = n > 0 ? (sum / n) : 0;
		}

		// Smooth baseline a little so ring doesn't "breathe" too hard packet-to-packet.
		if (!Number.isFinite(this.ringBaseline)) this.ringBaseline = packetBaseline;
		this.ringBaseline = (0.85 * this.ringBaseline) + (0.15 * packetBaseline);

		// Write each interval bar into successive fixed ring slots
		for (let i = 0; i < bars.length; i++) {
			const b = bars[i];
			const slot = this.presentBox;

			const bMin = Number(b.min);
			const bMax = Number(b.max);
			const bMean = Number(b.mean);

			if (!Number.isFinite(bMin) || !Number.isFinite(bMax)) {
				continue;
			}

			this.rawBottom[slot] = bMin;
			this.rawTop[slot] = bMax;
			this.rawMean[slot] = Number.isFinite(bMean) ? bMean : (bMin + bMax) / 2;
			this.spikeAtBox[slot] = !!b.spike;
			this.hasData[slot] = true;

			// Advance moving cursor around fixed slots
			this.presentBox = (this.presentBox + this.writeStride) % numBoxes;
		}

		// Recompute global ring extents from stored slots, then rescale all display lines.
		this.recomputeRingScale();
		this.rescaleDisplayArrays();
	}

	recomputeRingScale() {
		let minSeen = null;
		let maxSeen = null;

		for (let i = 0; i < numBoxes; i++) {
			if (!this.hasData[i]) continue;

			const lo = this.rawBottom[i];
			const hi = this.rawTop[i];

			if (minSeen === null || lo < minSeen) minSeen = lo;
			if (maxSeen === null || hi > maxSeen) maxSeen = hi;
		}

		this.ringMinSeen = minSeen;
		this.ringMaxSeen = maxSeen;
	}

	rescaleDisplayArrays() {
		// Scale around the (smoothed) baseline so prior slots can resize when ring min/max changes.
		let maxAbsDev = 1e-6;

		for (let i = 0; i < numBoxes; i++) {
			if (!this.hasData[i]) continue;
			maxAbsDev = Math.max(
				maxAbsDev,
				Math.abs(this.rawTop[i] - this.ringBaseline),
				Math.abs(this.rawBottom[i] - this.ringBaseline)
			);
		}

		const scale = this.lineExtent / maxAbsDev;

		for (let i = 0; i < numBoxes; i++) {
			if (!this.hasData[i]) {
				this.tops[i] = 0;
				this.bottoms[i] = 0;
				continue;
			}

			let top = Math.round((this.rawTop[i] - this.ringBaseline) * scale);
			let bottom = Math.round((this.rawBottom[i] - this.ringBaseline) * scale);

			if (top > this.lineExtent) top = this.lineExtent;
			if (top < -this.lineExtent) top = -this.lineExtent;
			if (bottom > this.lineExtent) bottom = this.lineExtent;
			if (bottom < -this.lineExtent) bottom = -this.lineExtent;

			this.tops[i] = top;
			this.bottoms[i] = bottom;
		}
	}

	advanceOneFrame() {
		// Packet-driven ring: do not generate/shift data here.
		// Just decay local flashes for compatibility with game events.
		for (let i = 0; i < numBoxes; i++) {
			if (this.localSpikeDecay[i] > 0) this.localSpikeDecay[i]--;
		}
	}

	addSpike() {
		// Keep compatibility with existing game calls.
		// Flash the CURRENT cursor slot (write head position).
		this.localSpikeDecay[this.presentBox] = 12;
	}

	getPresentAngle() {
		return this.presentBox * 360 / numBoxes;
	}

	draw(graphics) {
		for (let i = 0; i < numBoxes; i++) {
			let color;

			const isCursor = (i === this.presentBox);
			const localSpike = this.localSpikeDecay[i] > 0;
			const serverSpike = this.spikeAtBox[i] === true;

			if (localSpike) {
				color = 0xffffff;     // game flash
			} else if (serverSpike) {
				color = 0xffaa33;     // server interval spike
			} else if (!this.hasData[i]) {
				color = 0x666666;     // empty slot before stream fills ring
			} else if (isCursor) {
				color = 0xff66ff;     // cursor highlight
			} else {
				color = 0xff00ff;     // normal
			}

			const angle = (i * 360 / numBoxes) % 360;
			this.drawLine(graphics, angle, this.tops[i], this.bottoms[i], color);
		}
	}

	drawLine(graphics, theta, top, bottom, color) {
		var r = ringRadius + top;
		var unadjustedInnerXY = pol2cart(r, theta);
		var innerX = unadjustedInnerXY[0];
		var innerY = unadjustedInnerXY[1];
		var innerCoords = adjustCoordsRing(innerX, innerY);

		var r2 = ringRadius + bottom;
		var outerX, outerY;
		[outerX, outerY] = pol2cart(r2, theta);
		var outerCoords = adjustCoordsRing(outerX, outerY);

		graphics.lineStyle(4, color);
		graphics.lineBetween(innerCoords[0], innerCoords[1], outerCoords[0], outerCoords[1]);
	}
}