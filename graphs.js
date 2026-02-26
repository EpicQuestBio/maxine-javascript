
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
	// Keeps the same public methods the game already calls:
	//   advanceOneFrame(), addSpike(), draw(graphics)
	// so maxine.js doesn't have to change much.
	constructor() {
		this.presentBox = 0;
		this.lineExtent = 25;

		this.tops = new Array(numBoxes).fill(0);
		this.bottoms = new Array(numBoxes).fill(0);
		this.spikeAtBox = new Array(numBoxes).fill(false);

		this.connected = false;
		this.lastPacketTs = 0;
		this.lastSource = "none";
		this.lastError = "";
		this.wsUrl = "ws://localhost:8766";
		this.ws = null;

		// Optional local flash overlay if game code calls addSpike()
		this.localSpikeDecay = new Array(numBoxes).fill(0);
	}

	setServerUrl(url) {
		if (typeof url === "string" && url.trim().length > 0) {
			this.wsUrl = url.trim();
		}
	}

	connect(url) {
		if (url) this.setServerUrl(url);

		// If already open/opening, don't double-connect
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

			// Python server sends hello + mq_tick
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

	applyTick(tick) {
		this.lastPacketTs = Date.now();
		this.lastSource = tick.source || "unknown";

		const ig = tick.interval_graph || {};
		const bars = Array.isArray(ig.bars) ? ig.bars : [];

		if (!bars.length) return;

		// Build full-ring arrays from interval bars.
		// We map each interval bar onto a contiguous slice of numBoxes.
		const barMins = bars.map(b => Number(b.min));
		const barMaxs = bars.map(b => Number(b.max));
		const barMeans = bars.map(b => Number(b.mean));

		// Prefer provided baseline, otherwise mean of bar means
		let baseline = Number(ig.baseline);
		if (!Number.isFinite(baseline)) {
			baseline = barMeans.reduce((a, b) => a + b, 0) / Math.max(1, barMeans.length);
		}

		// Dynamic scale so the ring uses most of lineExtent
		let maxAbsDev = 1e-6;
		for (let i = 0; i < bars.length; i++) {
			maxAbsDev = Math.max(maxAbsDev, Math.abs(barMaxs[i] - baseline), Math.abs(barMins[i] - baseline));
		}
		const scale = this.lineExtent / maxAbsDev;

		for (let i = 0; i < numBoxes; i++) {
			const barIdx = Math.floor(i * bars.length / numBoxes);
			const b = bars[barIdx];
			const bMin = Number(b.min);
			const bMax = Number(b.max);

			// Signed offsets around ringRadius:
			// "top" = max excursion, "bottom" = min excursion
			// (drawLine handles negative values, which looks good for in/out ring motion)
			let top = Math.round((bMax - baseline) * scale);
			let bottom = Math.round((bMin - baseline) * scale);

			// Clamp to visual extent
			if (top > this.lineExtent) top = this.lineExtent;
			if (top < -this.lineExtent) top = -this.lineExtent;
			if (bottom > this.lineExtent) bottom = this.lineExtent;
			if (bottom < -this.lineExtent) bottom = -this.lineExtent;

			this.tops[i] = top;
			this.bottoms[i] = bottom;
			this.spikeAtBox[i] = !!b.spike;
		}

		// Optional: use packet timestamp/cursor-ish motion to move highlight location
		this.presentBox = (this.presentBox + 1) % numBoxes;
	}

	advanceOneFrame() {
		// This class is packet-driven, not frame-driven.
		// Keep tiny housekeeping only (cursor + decay of local spikes).
		this.presentBox = (this.presentBox + 1) % numBoxes;

		for (let i = 0; i < numBoxes; i++) {
			if (this.localSpikeDecay[i] > 0) this.localSpikeDecay[i]--;
		}
	}

	addSpike() {
		// Keep compatibility with existing game calls.
		// If game logic adds a spike locally, briefly flash it on top of server data.
		this.localSpikeDecay[this.presentBox] = 12;
	}

	getPresentAngle() {
		return this.presentBox * 360 / numBoxes;
	}

	draw(graphics) {
		for (let i = 0; i < numBoxes; i++) {
			let color;

			const localSpike = this.localSpikeDecay[i] > 0;
			if (localSpike) {
				color = 0xffffff;        // local game spike flash
			} else if (this.spikeAtBox[i] === true) {
				color = 0xffaa33;        // server-detected spike interval
			} else {
				color = 0xff00ff;        // normal ring line
			}

			const top = this.tops[i];
			const bottom = this.bottoms[i];
			const angle = (i * 360 / numBoxes) % 360;
			this.drawLine(graphics, angle, top, bottom, color);
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