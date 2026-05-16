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

class ChatInputBox {
    constructor(scene, rect, options = {}) {
        this.scene = scene;
        this.rect = rect;
        this.onSubmit = options.onSubmit || function () {};

        this.input = document.createElement("input");
        this.input.type = "text";
        this.input.placeholder = options.placeholder || "Type a message...";
        this.input.maxLength = options.maxLength || 160;

        this.input.style.position = "fixed";
        this.input.style.zIndex = options.zIndex || "1000";
        this.input.style.fontSize = options.fontSize || "16px";
        this.input.style.fontFamily = options.fontFamily || "Arial, sans-serif";
        this.input.style.color = options.color || "#d7ffd7";
        this.input.style.background = options.background || "rgba(5, 20, 10, 0.72)";
        this.input.style.border = options.border || "1px solid rgba(180, 255, 180, 0.65)";
        this.input.style.borderRadius = options.borderRadius || "6px";
        this.input.style.padding = "0 8px";
        this.input.style.outline = "none";
        this.input.style.boxSizing = "border-box";

        document.body.appendChild(this.input);

        this.input.addEventListener("keydown", (event) => {
            event.stopPropagation();

            if (event.key === "Enter") {
                const message = this.input.value.trim();

                if (message.length > 0) {
                    this.onSubmit(message);
                    this.input.value = "";
                }

                event.preventDefault();
                return;
            }

            // Let normal text editing keys work:
            // space, arrows, backspace, letters, numbers, symbols, etc.
        });

        this.input.addEventListener("pointerdown", (event) => event.stopPropagation());
        this.input.addEventListener("touchstart", (event) => event.stopPropagation());

        this.updatePosition();

        this.focused = false;

        this.input.addEventListener("focus", () => {
            this.focused = true;
        });

        this.input.addEventListener("blur", () => {
            this.focused = false;
        });
    }

    isFocused() {
        return this.focused || document.activeElement === this.input;
    }

    updatePosition() {
        const pageRect = worldRectToPageRect(this.scene, this.rect);

        this.input.style.left = `${pageRect.x}px`;
        this.input.style.top = `${pageRect.y}px`;
        this.input.style.width = `${pageRect.width}px`;
        this.input.style.height = `${pageRect.height}px`;
    }

    setRect(rect) {
        this.rect = { ...this.rect, ...rect };
        this.updatePosition();
    }

    setVisible(visible) {
        this.input.style.display = visible ? "block" : "none";
    }

    destroy() {
        if (this.input) {
            this.input.remove();
            this.input = null;
        }
    }
}

function worldRectToPageRect(scene, rect) {
    const canvas = scene.game.canvas;
    const canvasBounds = canvas.getBoundingClientRect();

    const gameWidth = scene.scale.gameSize.width;
    const gameHeight = scene.scale.gameSize.height;
    const gameAspect = gameWidth / gameHeight;

    const boxWidth = canvasBounds.width;
    const boxHeight = canvasBounds.height;
    const boxAspect = boxWidth / boxHeight;

    let gameDisplayX = canvasBounds.left;
    let gameDisplayY = canvasBounds.top;
    let gameDisplayWidth = boxWidth;
    let gameDisplayHeight = boxHeight;

    if (boxAspect > gameAspect) {
        // Container/canvas is too wide: vertical bars left and right.
        gameDisplayHeight = boxHeight;
        gameDisplayWidth = boxHeight * gameAspect;
        gameDisplayX = canvasBounds.left + (boxWidth - gameDisplayWidth) / 2;
    } else if (boxAspect < gameAspect) {
        // Container/canvas is too tall: horizontal bars top and bottom.
        gameDisplayWidth = boxWidth;
        gameDisplayHeight = boxWidth / gameAspect;
        gameDisplayY = canvasBounds.top + (boxHeight - gameDisplayHeight) / 2;
    }

    const scaleX = gameDisplayWidth / gameWidth;
    const scaleY = gameDisplayHeight / gameHeight;

    return {
        x: gameDisplayX + rect.x * scaleX,
        y: gameDisplayY + rect.y * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY
    };
}