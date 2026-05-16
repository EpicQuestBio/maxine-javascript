class Controls {
    constructor(scene) {
        // The game was originally 2100:900 when I added the controls so since it's
        // now about 2100:1181 (16:9 widescreen) you should add 281 to everything that
        // should be at the bottom
        let f = 281 

        this.activateControlsAdjuster = false;
        this.game = scene;
        this.panel = scene.add.sprite(1790, 607+f, 'panel');
        this.panel.setOrigin(0.5);
        this.voltageKnob = scene.add.sprite(1894, 490+f, 'knob');
        this.voltageKnob.setOrigin(0.5);
        this.zapper = scene.add.sprite(2030, 550+f, 'switch_up');
        this.zapperOn = false;
        this.voltageSetting = 0;
        this.millivolts = 0;
        this.voltageText = scene.add.text(1850, 560+f, '0MV',
         { fontSize: '24px', fill: '#ff0000', fontFamily: 'led_font' });

        this.tvFrame = scene.add.sprite(1960, 150, 'tv');
        this.tvFrame.setDepth(60);

        this.chatFrame = scene.add.sprite(0, 302, 'chat');
        this.chatFrame.setOrigin(0);
        this.chatRect = {
            x: this.chatFrame.x + 12,
            y: this.chatFrame.y + 12,
            width: 246,
            height: 265
        }
        
        // The object that moves with the mouse in the main update loop if 
        // activateControlsAdjuster is turned on
        this.adjustableObject = this.chatFrame;

        // 1. Make the sprite interactive
        this.zapper.setInteractive();
        // 2. Add the pointerdown listener ("this" refers to zapper)
        this.zapper.on('pointerdown', (pointer) => {
            this.triggerZapper();
        });

        this.voltageKnob.setInteractive();
        this.voltageKnob.on('pointerdown', (pointer, localX) => {
            const halfWidth = this.voltageKnob.width / 2;

            if (localX < halfWidth - 20) {
                this.setVoltageSetting(-1);
                //this.voltageKnob.angle = -30;
            } else if (localX > halfWidth + 10) {
                this.setVoltageSetting(1);
                //this.voltageKnob.angle = +30;
            } else {
                this.setVoltageSetting(0);
                //this.voltageKnob.angle = 0;
            }

            console.log("localX = ", localX);
            console.log("voltageSetting = ", this.voltageSetting);
        });
    }

    setExactVoltage(millivolts) {
        this.voltageText.setText(millivolts + " mV")
    }

    setVoltageSetting(voltageSetting) {
        this.voltageSetting = voltageSetting;
        // if (voltageSetting < 0) {
        //     this.setExactVoltage(-500);
        // } else if (voltageSetting == 0) {
        //     this.setExactVoltage(0);
        // } else if (voltageSetting > 0) {
        //     this.setExactVoltage(500);
        // }
    }

    triggerZapper() {
        //const zapMilliVolts = 1000;
        // this.setExactVoltage(zapMilliVolts);

        this.zapperOn = true;
        // this.zapper.setTexture('switch_down');

        // setTimeout(() => {
        //     this.zapperOn = false;
        //     this.zapper.setTexture('switch_up');
        //     // Set it to the voltage setting set on the knob, even if they turn the knob
        //     // while the zapper is on.
        //     this.setVoltageSetting(this.voltageSetting);
        // }, 500);
    }

    syncVisualState() {
        // Voltage knob visual
        if (this.voltageSetting === -1) {
            this.voltageKnob.angle = -30;
        } else if (this.voltageSetting === 1) {
            this.voltageKnob.angle = +30;
        } else {
            this.voltageKnob.angle = 0;
        }

        // Millivolt text
        if (this.voltageText) {
            this.voltageText.setText(String(this.millivolts) + "MV");
        }

        // Zapper visual
        if (this.zapper) {
            this.zapper.setTexture(this.zapperOn ? 'switch_down' : 'switch_up');
        }
    }

    setShowControls(visible) {
        this.panel.visible = visible;
        this.voltageKnob.visible = visible;
        this.zapper.visible = visible;
        this.voltageText.visible = visible;
    }
}