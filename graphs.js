
// Used by the signal ring. It's based on the signal ring's size
// rather than the torus's size.
function adjustCoordsRing(x, y) {
	const widthToHeightRatio = ringWidth / ringHeight

	var newx, newy

	newx = widthToHeightRatio * x + worldCenter[0]
	newy = y + worldCenter[1]

	return [newx, newy]
}


class VerticalLineRing {
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
		console.log("adding spike to " + this.presentBox);
	}

	draw(graphics) {
		// Draw the vertical lines
		for (var i = 0; i < numBoxes; i++) {
			var color;
			if (this.spikeAtBox[i] == true) {
				console.log("Drawing spike at " + i)
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