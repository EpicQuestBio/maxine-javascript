class ChatBox {
    constructor(scene, rect) {
        this.scene = scene;
        this.rect = rect;
        this.graphics = scene.add.graphics();
        this.bgColor = 0x07120a;
    }

    update() {

    }

    draw() {
        let g = this.graphics;
        g.fillStyle(this.bgColor, 0.75);
        g.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    }
}