
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
	}

	advanceOneFrame() {
		this.presentBox = (this.presentBox + 1) % numBoxes;
		this.tops = this.fakeTops;
		this.bottoms = this.fakeBottoms;

		var first = this.tops.shift();
		this.tops.push(Math.floor(Math.random() * (this.lineExtent + 1)));

		first = this.bottoms.shift();
		this.bottoms.push(Math.floor(Math.random() * (this.lineExtent + 1)));
	}

	draw(graphics) {
		var numLines = this.tops.length;
		var dataStartBox = (this.presentBox - numLines) % numBoxes;
		// Draw the vertical lines
		for (var i = 0; i < numLines; i++) {
			const brightness = Math.floor(255 * i / numBoxes)
			//color = [brightness, brightness, 0]
			const color = 0x00ff00

			var top = this.tops[i];
			var bottom = this.bottoms[i];

			var angle = ((dataStartBox + i) * 360 / numBoxes) % 360;
			this.drawLine(graphics, angle, top, bottom, color);
		}
		this.drawLine(graphics, this.getPresentAngle(), -2 * this.lineExtent, 0, 0x0000bb);
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
		graphics.moveTo(innerCoords[0], innerCoords[1]);
		graphics.lineTo(outerCoords[0], outerCoords[1]);
		graphics.strokePath();

		// Oops don't remember what this bit does except slow it down
		//for (var x = 0, y = 0; x < 1000, y < 1000; x++, y++) {
		//	graphics.fillCircle(x, y, 1);
		//}
	}
}