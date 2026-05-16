class ChatBox {
    constructor(scene, rect, options = {}) {
        this.scene = scene;
        this.rect = rect;

        this.padding = options.padding ?? 10;
        this.maxMessages = options.maxMessages ?? 8;

        this.bgColor = options.bgColor ?? 0x07120a;
        this.bgAlpha = options.bgAlpha ?? 0.65;

        this.messages = [];

        this.graphics = scene.add.graphics();
        this.graphics.setDepth(options.depth ?? 70);

        this.text = scene.add.text(
            this.rect.x + this.padding,
            this.rect.y + this.padding,
            "",
            {
                fontFamily: options.fontFamily ?? "Arial",
                fontSize: options.fontSize ?? "16px",
                color: options.color ?? "#d7ffd7",
                lineSpacing: options.lineSpacing ?? 4,
                wordWrap: {
                    width: this.rect.width - this.padding * 2,
                    useAdvancedWrap: true
                }
            }
        );

        this.text.setDepth((options.depth ?? 70) + 1);
        this.text.setOrigin(0, 0);

        this.draw();
    }

    addMessage(message, speaker = null) {
        const text = speaker ? `${speaker}: ${message}` : message;

        this.messages.push(text);

        while (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }

        this.refreshText();
    }

    setMessages(messages) {
        this.messages = messages.slice(-this.maxMessages);
        this.refreshText();
    }

    clear() {
        this.messages = [];
        this.refreshText();
    }

    refreshText() {
        this.text.setText(this.messages.join("\n"));

        // If wrapped text is too tall, drop oldest messages until it fits.
        const maxHeight = this.rect.height - this.padding * 2;

        while (this.messages.length > 0 && this.text.height > maxHeight) {
            this.messages.shift();
            this.text.setText(this.messages.join("\n"));
        }
    }

    setRect(rect) {
        this.rect = { ...this.rect, ...rect };

        this.text.setPosition(
            this.rect.x + this.padding,
            this.rect.y + this.padding
        );

        this.text.setWordWrapWidth(
            this.rect.width - this.padding * 2,
            true
        );

        this.refreshText();
        this.draw();
    }

    draw() {
        const g = this.graphics;
        g.clear();

        // Translucent background
        g.fillStyle(this.bgColor, this.bgAlpha);
        g.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    }

    setVisible(visible) {
        this.graphics.setVisible(visible);
        this.text.setVisible(visible);
    }

    destroy() {
        if (this.graphics) this.graphics.destroy();
        if (this.text) this.text.destroy();
    }
}