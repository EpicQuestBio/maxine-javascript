const debug = false;

var config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    width: 2100,
    height: 900,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: debug
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

var player;
var cursors;
var level = 1;
var consoleScore = 0;
var challengerScore = 0;
var consoleScoreText;
var challengerScoreText;
var projectiles;
var mushrooms;
var spinners;
var bouncers;
var cannons;
var monsterTimer;
var pore;
var boomFrames = [];
var spinshroomFrames = [];
var mushromancerFrames = [];
var vlr;
var signalMode = "random";   // "random" or "live"
var signalStatusRefreshTick = 0;
var signalRingStatusTimer = 0;
var bgVideo;
var masterSpiralRotation = 0;
var cannonShooting = true;
var cannonBlastDelay = 500;
var cannonBlastTimeout = cannonBlastDelay;
var cannonSporeTimeout = 60;
var physics;
var horizontalWalls;
var verticalWalls;
var lastLiveSignalSpawnTime = 0;

var game = new Phaser.Game(config);
var scene;

var controls = null;

var lastSentVoltageSetting = null;
var lastSentZapperOn = false;

var targetSet = false;
var targetX = null;
var targetY = null;

function debugWarn(message) {
    if (debug) {
        console.warn(message);
    }
}

function preload() {
    this.load.image('maxine_neutral', 'assets/maxine_neutral.png');
    this.load.image('maxine_left', 'assets/maxine_left.png');
    this.load.image('maxine_right', 'assets/maxine_right.png');
    this.load.image('maxine_up', 'assets/maxine_up.png');
    this.load.image('maxine_down', 'assets/maxine_down.png');

    // Preload spore sprites
    this.load.image('spore1', 'assets/spore1.png');
    this.load.image('spore2', 'assets/spore2.png');
    this.load.image('spore3', 'assets/spore3.png');

    // Preload mushroom sprites
    this.load.image('pink_oyster1', 'assets/pink_oyster1.png');
    this.load.image('pink_oyster2', 'assets/pink_oyster2.png');

    // Preload pore sprite
    this.load.image('pore', 'assets/pore.png');

    // Preload sound files
    this.load.audio('eep', 'assets/eep.wav');
    this.load.audio('good', 'assets/good.wav');

    // Preload boom image files
    for (var i = 1; i <= 30; i++) {
        boomFrames.push({ key: 'boom' + i });
        this.load.image('boom' + i, 'assets/boom' + i + '.png');
    }

    // Preload spinshroom image files
    for (var i = 1; i <= 8; i++) {
        spinshroomFrames.push({ key: 'spinshroom' + i });
        this.load.image('spinshroom' + i, 'assets/spinshroom' + i + '.png');
    }

    // Preload mushromancer image files
    for (var i = 1; i <= 4; i++) {
        mushromancerFrames.push({ key: 'mushromancer' + i });
        this.load.image('mushromancer' + i, 'assets/mushromancer' + i + '.png');
    }

    // Preload bouncer image file
    this.load.image('purple_mushroom', 'assets/purple_mushroom.png');

    this.load.image('torus', 'assets/torus.png');

    // Labyrinth
    this.load.image('wall_horizontal', 'assets/wall_horizontal.png');

    // // load background video
    // this.load.video('mountains', 'mountains.mp4', true);

    // Control panel
    this.load.image('panel', 'assets/panel.png');
    this.load.image('knob', 'assets/voltage_knob.png');
    this.load.image('switch_up', 'assets/switch_big_frame_1.png');
    this.load.image('switch_down', 'assets/switch_big_frame_2.png');

    // LED font
    this.load.font('led_font', 'assets/ds-digi.ttf');

    scene = this;
}

function getSignalServerUrlFromControls() {
    var el = document.getElementById("signalServerUrl");
    if (!el || !el.value) return "ws://localhost:8766";
    return el.value.trim();
}

function setSignalControlsStatus(message) {
    var el = document.getElementById("signalConnStatus");
    if (el) el.textContent = message;
}

function refreshSignalControlsStatus() {
    if (!vlr) return;

    if (signalMode === "random") {
        setSignalControlsStatus("Random mode");
        return;
    }

    var msg = "";
    if (vlr.connected) {
        msg = "Live connected";
        if (vlr.lastSource) msg += " (" + vlr.lastSource + ")";
        if (vlr.lastPacketTs) msg += " • " + (Date.now() - vlr.lastPacketTs) + " ms";
    } else {
        msg = "Live disconnected";
        if (vlr.lastError) msg += " • " + vlr.lastError;
    }
    setSignalControlsStatus(msg);
}

function setSignalMode(mode) {
    if (mode !== "live") mode = "random";
    signalMode = mode;

    if (!vlr) return;

    if (signalMode === "live") {
        // Use the live WebSocket-backed signal ring
        vlr = new VerticalLineRing();
        var url = getSignalServerUrlFromControls();
        if (typeof vlr.setServerUrl === "function") vlr.setServerUrl(url);

        // Stop timeout-based monster spawning in live mode
        if (monsterTimer) {
            monsterTimer.paused = true;
        }

        setSignalControlsStatus("Live mode (not connected)");
        controls.setShowControls(true);
    } else {
        // Use the old random ring behavior
        if (typeof vlr.disconnect === "function") {
            vlr.disconnect();
        }
        vlr = new RandomVerticalLineRing();

        // Re-enable timeout-based spawning in random mode
        if (monsterTimer) {
            monsterTimer.paused = false;
        }

        setSignalControlsStatus("Random mode");
        controls.setShowControls(false);
    }
}

function connectSignalRing() {
    if (!vlr || signalMode !== "live") {
        setSignalControlsStatus("Switch Signal Mode to Live first");
        return;
    }
    if (typeof vlr.connect !== "function") return;
    var url = getSignalServerUrlFromControls();
    vlr.connect(url);
    setSignalControlsStatus("Connecting to " + url + "...");
}

function disconnectSignalRing() {
    if (!vlr || signalMode !== "live") return;
    if (typeof vlr.disconnect === "function") vlr.disconnect();
    setSignalControlsStatus("Live disconnected");
}

function chooseMonsterTypeFromSignal() {
    // Fallback safely if no live packet summary exists yet
    if (!vlr || typeof vlr.getLastPacketSummary !== "function") {
        return "pink"; // middle difficulty fallback
    }

    var s = vlr.getLastPacketSummary();
    if (!s) return "pink";

    var intensity = Number(s.spanNorm || 0);       // 0..1 relative to recent spans
    var persistence = Number(s.persistence || 0);  // 0..1 fraction of recent spike packets

    // ---- Simple 2D mapping (tune by feel) ----
    // Easy: short/weak isolated events
    if (intensity < 0.6 && persistence < 0.10) {
        return "spin";
    }

    // Hard: strong + sustained
    if (intensity >= 0.70 && persistence >= 0.15) {
        return "doom";
    }

    // Rare "jump scare": very strong spike even if not persistent
    // if (intensity >= 0.90) {
    //     return "doom";
    // }

    // Otherwise medium
    return "pink";
}

function sendGameMonsterSpawnedEvent(monsterType, spawnAngleDeg, triggerSource, signalSummary) {
    // Reuse the existing live signal WebSocket if available.
    if (vlr && vlr.ws && vlr.ws.readyState === WebSocket.OPEN) {
        vlr.ws.send(JSON.stringify({
            type: "game_monster_spawned",
            payload: {
                monster_type: monsterType,
                spawn_angle_deg: spawnAngleDeg,
                trigger_source: triggerSource,
                signal_summary: signalSummary || {}
            }
        }));
    }
}

function getLatestSignalSummaryForRecording() {
    if (!vlr || typeof vlr.getLastPacketSummary !== "function") {
        return {};
    }

    var s = vlr.getLastPacketSummary();
    if (!s) return {};

    return {
        hadSpike: !!s.hadSpike,
        span: Number(s.span || 0),
        spanNorm: Number(s.spanNorm || 0),
        persistence: Number(s.persistence || 0)
    };
}

function sendControlIntent(intent, params) {
    if (!vlr || !vlr.ws || vlr.ws.readyState !== WebSocket.OPEN) {
        return;
    }

    vlr.ws.send(JSON.stringify({
        type: "control_intent",
        payload: {
            actor: "player",
            intent: intent,
            params: params || {}
        }
    }));
}

function applyServerControlStateToPanel(payload) {
    if (!controls || !payload) return;

    if (typeof payload.voltage_setting !== "undefined") {
        controls.voltageSetting = payload.voltage_setting;
    }

    if (typeof payload.display_millivolts !== "undefined") {
        controls.millivolts = payload.display_millivolts;
    }

    if (typeof payload.zapper_active !== "undefined") {
        controls.zapperOn = !!payload.zapper_active;
    }
}

function handleControlResultMessage(payload) {
    if (!payload) return;

    // Optional: surface friendly status text somewhere
    if (payload.message && typeof setSignalControlsStatus === "function") {
        setSignalControlsStatus(payload.message);
    }
}

function create() {
    // // Set up the background video
    // bgVideo = this.add.video(0, 0, 'mountains').setOrigin(0);
    // bgVideo.displayHeight = worldHeight;
    // bgVideo.displayWidth = worldWidth;
    // bgVideo.play(true);

    // Set world bounds
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

    // The torus
    var left = worldCenter[0];
    var top = worldCenter[1];
    // torus = this.physics.add.sprite(left, top, 'torus');
    // torus.setOrigin(0.5);
    // // Set the scale between 0 and 1
    // torus.scaleX = torusOuterWidth / 1683;
    // torus.scaleY = torusOuterHeight / 1267;

    // The player and its settings
    player = this.physics.add.sprite(maxineStart[0], maxineStart[1], 'maxine_neutral');
    player.setOrigin(0.5);
    player.scale = 0.5
    player._MQoldPos = [player.x, player.y]

    //  Player physics properties.
    player.setCollideWorldBounds(true);

    // The pore.
    pore = this.physics.add.sprite(worldCenter[0], worldCenter[1], 'pore');
    pore.setOrigin(0.5);

    // Set camera bounds
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    //this.cameras.main.startFollow(player);

    //  Input Events
    cursors = this.input.keyboard.createCursorKeys();

    //  The scores
    consoleScoreText = this.add.text(16, 16, 'Zavier: 0',
         { fontSize: '32px', fill: '#ffffff', fontFamily: 'led_font' });
    consoleScoreText.setScrollFactor(0);

    challengerScoreText = this.add.text(16, 48, 'Kent: 0', 
        { fontSize: '32px', fill: '#ffffff', fontFamily: 'led_font'});
    challengerScoreText.setScrollFactor(0);

    // Create spore animation
    this.anims.create({
        key: 'spore_anim',
        frames: [
            { key: 'spore1' },
            { key: 'spore2' },
            { key: 'spore3' }
        ],
        frameRate: 30,
        repeat: -1
    });

    // Create mushroom animation
    this.anims.create({
        key: 'mush_anim',
        frames: [
            { key: 'pink_oyster1' },
            { key: 'pink_oyster2' }
        ],
        frameRate: 2,
        repeat: -1
    });

    // Create the boom animation
    this.anims.create({
        key: 'boom',
        frames: boomFrames, //this.anims.generateFrameNames('boom', { start: 1, end: 30, prefix: 'boom', zeroPad: 0 }),
        frameRate: 30,
        repeat: 0
    });

    // Create the spinshroom animation
    this.anims.create({
        key: 'spinshroom_anim',
        frames: spinshroomFrames,
        frameRate: 10,
        repeat: -1
    });

    // Create the cannon animation
    this.anims.create({
        key: 'mushromancer_anim',
        frames: mushromancerFrames,
        frameRate: 10,
        repeat: -1
    })

    projectiles = this.physics.add.group();
    // Create sprite groups for different kinds of mushrooms
    mushrooms = this.physics.add.group();
    spinners = this.physics.add.group();
    bouncers = this.physics.add.group();
    cannons = this.physics.add.group();
    // For the Labyrinth
    horizontalWalls = this.physics.add.staticGroup();
    verticalWalls = this.physics.add.staticGroup();

    // Start the monster timer
    monsterTimer = this.time.addEvent({
        delay: Phaser.Math.Between(4000, 8000),
        callback: addMonster,
        callbackScope: this,
        loop: true
    });

    // Set up collision detection between mushrooms and the pore
    this.physics.add.overlap(mushrooms, pore, mushroomHitsPore, null, this);

    // Set up collision detection between Maxine and the pore
    this.physics.add.overlap(player, pore, maxineHitsPore, null, this);

    // Set up collision detection between Maxine and the mushrooms
    this.physics.add.overlap(player, mushrooms, maxineHitsMushroom, null, this);

    // Set up collision detection between Maxine and the spinshrooms
    this.physics.add.overlap(player, spinners, maxineHitsSpinshroom, null, this);

    // Set up collision detection between Maxine and the bouncers
    // (using the same function for the same behavior)
    this.physics.add.overlap(player, bouncers, maxineHitsSpinshroom, null, this);

    // Maxine and the cannon(s)
    this.physics.add.overlap(player, cannons, maxineHitsPore, null, this)

    // Set up collision detection between bouncers and the pore
    this.physics.add.overlap(bouncers, pore, bouncerHitsPore, null, this);

    // Set up collision detection between Maxine and the spores
    this.physics.add.overlap(player, projectiles, maxineHitsProjectile, null, this);

    // The Labyrinth
    this.physics.add.collider(player, horizontalWalls);
    this.physics.add.collider(player, verticalWalls);
    physics = this.physics;

    this.graphics = this.add.graphics();

    // Initialize the current level.
    resetLevel();

    if (debug) {
        this.debugText = this.add.text(10, 10, '', { fontSize: '16px', fill: '#fff' });
        this.debugText.setScrollFactor(0);
    }

    // Add controls
    controls = new Controls(this);

    // Create the vertical line ring
    // Start in random mode by default (safe fallback)
    vlr = new RandomVerticalLineRing();
    // Sync UI mode selector if present
    var modeSelect = document.getElementById("signalMode");
    if (modeSelect) {
        signalMode = modeSelect.value || "random";
        if (signalMode !== "random") {
            setSignalMode(signalMode);
        } else {
            setSignalControlsStatus("Random mode");
            setSignalMode(signalMode);
        }
    }

    var urlInput = document.getElementById("signalServerUrl");
    if (urlInput && typeof vlr.setServerUrl === "function") {
        vlr.setServerUrl(urlInput.value || "ws://localhost:8766");
    }
    refreshSignalControlsStatus();

    this.input.on('pointerdown', (pointer) => {
        debugWarn(`Pointed at ${[pointer.worldX, pointer.worldY]}`);
        targetSet = true;
        targetX = pointer.worldX;
        targetY = pointer.worldY;
    });
}

function update() {
    if (debug) {
        this.debugText.setText([
            `Spore count: ${projectiles.getChildren().length}`,
            `Cannon timeout: ${cannonBlastTimeout}`,
            `Player position: ${Math.floor(player.x)}, ${Math.floor(player.y)}`,
            `Level: ${level}`
        ].join('\n'));
    }

    // Control player movement
    player.setVelocity(0);
    const speed = 360;

    if (cursors.left.isDown) {
        player.setVelocityX(-speed);
        targetSet = false;
    }
    else if (cursors.right.isDown) {
        player.setVelocityX(speed);
        targetSet = false;
    }

    if (cursors.up.isDown) {
        player.setVelocityY(-speed);
        targetSet = false;
    }
    else if (cursors.down.isDown) {
        player.setVelocityY(speed);
        targetSet = false;
    }

    if (player.body.velocity.x === 0 && player.body.velocity.y === 0) {
        player.setTexture('maxine_neutral');
    }

    // Move diagonally toward the target
    if (targetSet) {
        var angle = Phaser.Math.RadToDeg(
            Phaser.Math.Angle.Between(
                player.body.x, player.body.y,
                targetX, targetY
        ));
        // Calculate direction unit vector from a sprite's angle (in radians)
        const direction = this.physics.velocityFromAngle(angle, 1);

        // Multiply by your desired speed to get final velocity
        player.body.setVelocity(direction.x * speed, direction.y * speed);

        debugWarn(`angle to point=${angle}; direction={${[direction.x, direction.y]}`)

        if (Math.abs(player.body.x - targetX) < 5 &&
            Math.abs(player.body.y - targetY) < 5) {
                targetSet = false;
            }
    }

    if (pointOutsideSignalRing([player.x, player.y])) {
        [player.x, player.y] = player._MQoldPos;
    }
    player._MQoldPos = [player.x, player.y];

    if (player.body.velocity.x < 0) {
        player.setTexture('maxine_left');
    } else if (player.body.velocity.x > 0) {
        player.setTexture('maxine_right');
    } else if (player.body.velocity.y < 0) {
        player.setTexture('maxine_down');
    } else if (player.body.velocity.y > 0) {
        player.setTexture('maxine_up');
    }

    // Update each mushroom's position and angle based on its spiral state
    mushrooms.children.iterate(function (mush) {
        // Update the mushroom's spiral state
        mush.spiral_state.update();

        // Set the mushroom's position based on the spiral state
        mush.setPosition(mush.spiral_state.pos[0], mush.spiral_state.pos[1]);

        // Set the mushroom's angle based on the spiral state
        mush.setAngle(mush.spiral_state.angle);
    });

    // Delete spinshrooms or projectiles that hit the torus.
    projectiles.children.iterate(function (spore) {
        // The group includes undefined objects that have been destroyed already.
        if (spore === undefined) return;

        if (pointOutsideSignalRing([spore.x, spore.y])) {
            spore.destroy();
        }
    });

    spinners.children.iterate(function (spinner) {
        if (spinner === undefined) return;

        if (pointOutsideSignalRing([spinner.x, spinner.y])) {
            spinner.destroy();
        }
    });

    let physics = this.physics;
    bouncers.children.iterate(function (bouncer) {
        if (bouncer === undefined) return;

        var speed = 300;
        // Set the velocity based on the angle. It uses pixels per second.
        scene.physics.velocityFromAngle(bouncer.angle, speed, bouncer.body.velocity);

        if (pointOutsideSignalRing([bouncer.x, bouncer.y])) {
            // Move back to the previous frame's position, and change angle to bounce.
            [bouncer.x, bouncer.y] = bouncer._MQoldPos;
            bounceOffWall(bouncer);
        }

        bouncer._MQoldPos = [bouncer.x, bouncer.y];
    });

    this.graphics.clear();

    // Add the lines in the signal ring
    vlr.advanceOneFrame()
    vlr.draw(this.graphics)

    // In live mode, use server spike events to drive monster spawning
    // instead of timeout-based spawning.
    if (signalMode === "live" && vlr && typeof vlr.consumePendingSpikeEvents === "function") {
        var now = Date.now();

        if (now - lastLiveSignalSpawnTime >= 500) {
            var serverSpikesToUse = vlr.consumePendingSpikeEvents(1);

            if (serverSpikesToUse > 0) {
                addMonsterFromSignal.call(this);
                lastLiveSignalSpawnTime = now;
            }
        } else {
            // Cooldown active: drop any queued spikes so old signal doesn't pile up
            if (typeof vlr.clearPendingSpikeEvents === "function") {
                vlr.clearPendingSpikeEvents();
            } else {
                // fallback if method not added yet
                vlr.consumePendingSpikeEvents(999999);
            }
        }
    }

    // Refresh the signal connection status text occasionally (not every frame)
    signalStatusRefreshTick = (signalStatusRefreshTick + 1) % 15;
    if (signalStatusRefreshTick === 0) {
        refreshSignalControlsStatus();
    }

    // Add the spirals if desired. Keep rotation on for a Mushromancer spiral level
    masterSpiralRotation = (masterSpiralRotation + 1) % 360;
    //drawSpiral(masterSpiralRotation + 0, this.graphics);
    //drawSpiral(masterSpiralRotation + 180, this.graphics)

    // Get the gurk cannon to make a ring of spores and throw them at Maxine
    if (level == 6) {
        cannonBlastTimeout -= 1;
        cannonSporeTimeout -= 5;
        if (cannonBlastTimeout >= 0) {
            projectiles.children.iterate(function (spore) {
                let ss = new SpiralState(0.5, masterSpiralRotation, ringHeight - 10,
                    1, worldCenter, ringWidth / ringHeight);
                ss.update();
                var angle = (ss.angle + 90) % 360;
                // scene.physics.velocityFromAngle(angle, 3, spore.body.velocity);
                spore.setPosition(ss.pos[0], ss.pos[1]);
            });
        } else {
            if (cannonBlastTimeout == -1) {
                cannonShooting = false;
                projectiles.children.iterate(function (spore) {
                    let angleBetween = Math.atan2(spore.y - player.y, spore.x - player.x);//Between(spore.x, spore.y, player.x, player.y);
                    scene.physics.velocityFromAngle(angleBetween, 10 * 60, spore.body.velocity);
                });
            }


            var sporeCount = projectiles.children.length;

            if (sporeCount == 0) {
                cannonBlastTimeout = cannonBlastDelay;
                cannonShooting = true;
            }
        }
    }

    signalRingStatusTimer = (signalRingStatusTimer + 1) % 15;
    if (signalRingStatusTimer === 0) {
        refreshSignalControlsStatus();
    }

    updateStatusBar();

    if (debug && signalMode === "live" && vlr && typeof vlr.getLastPacketSummary === "function") {
        var s = vlr.getLastPacketSummary();
        if (s && (signalStatusRefreshTick === 0) && !!s.hadSpike) {
            console.log("signal", {
                spanNorm: Number(s.spanNorm || 0).toFixed(2),
                persistence: Number(s.persistence || 0).toFixed(2),
                hadSpike: !!s.hadSpike,
                monsterKind: chooseMonsterTypeFromSignal()
            });
        }
    }

    // Option to move the controls around with the mouse cursor so you can find
    // the right positions.
    if (controls && controls.activateControlsAdjuster) {
        const pointer = this.input.activePointer;
        controls.adjustableObject.setPosition(pointer.x, pointer.y);
        console.log(`Pointer at (${pointer.x},${pointer.y})`);
    }

    if (signalMode === "live" && controls) {
        // Send voltage intent when the panel knob changes
        if (controls.voltageSetting !== lastSentVoltageSetting) {
            lastSentVoltageSetting = controls.voltageSetting;
            sendControlIntent("set_voltage_setting", {
                value: controls.voltageSetting
            });
        }

        // Send zap intent on rising edge only
        if (controls.zapperOn && !lastSentZapperOn) {
            sendControlIntent("trigger_zapper", {});
        }
        lastSentZapperOn = !!controls.zapperOn;
    }

    if (signalMode === "live" && controls) {
        controls.syncVisualState();
    }
}

function updateStatusBar() {
    var levelFinished = false;
    if (consoleScore >= 1000) {
        document.getElementById("statusBar").textContent = "Slightly less successful";
        levelFinished = true;
    } else if (challengerScore >= 1000) {
        document.getElementById("statusBar").textContent = "You win!";
        levelFinished = true;
    }

    if (levelFinished) {
        setTimeout(resetLevel, 5000);
    }
}

function resetLevel() {
    var ls = document.getElementById("levelSelect");
    var text = ls.options[ls.selectedIndex].text;
    document.getElementById("statusBar").textContent = text;

    consoleScore = 0;
    challengerScore = 0;
    scoresChanged();

    var ls = document.getElementById("levelSelect");
    var value = Number(ls.options[ls.selectedIndex].value);
    var text = ls.options[ls.selectedIndex].text;
    level = value;

    // Remove the previous cannon if applicable
    cannons.children.iterate(function (cannon) {
        if (cannon !== undefined) {
            if (cannon._MQsporeTimer !== undefined) {
                cannon._MQsporeTimer.destroy();
            }
            cannon.destroy();
        }
    });

    // Initialize specific levels
    if (level == 4 || level == 5 || level == 6) {
        makeCannon();
    }

    if (level == 7) {
        setupLabyrinth();
    }
}

function increaseConsoleScore(points) {
    consoleScore += points;
    if (consoleScore > 1000) consoleScore = 1000;
    scoresChanged();
}

function increaseChallengerScore(points) {
    challengerScore += points;
    if (challengerScore > 1000) challengerScore = 1000;
    scoresChanged();
}

function scoresChanged() {
    consoleScoreText.setText('Kent: ' + consoleScore);
    challengerScoreText.setText('Zavier: ' + challengerScore);
}


function mushroomHitsPore(pore, mushroom) {
    // Destroy the mushroom when it hits the pore.
    // Used for pink oysters.
    mushroom.destroy();

    // Clean up the spore timer
    if (mushroom.sporeTimer) {
        mushroom.sporeTimer.destroy();
    }
}

function bouncerHitsPore(pore, bouncer) {
    // Destroy the bouncer when it hits the pore.
    // Used for purple mushrooms (bouncers).
    bouncer.destroy();
    this.sound.play('good');

    increaseChallengerScore(100);
}

function maxineHitsPore(maxine, pore) {
    // Play the "eep" sound
    this.sound.play('eep');

    // Disable Maxine's movement
    maxine.setVelocity(0);
    maxine.setImmovable(true);
    maxine.body.enable = false;

    // Hide Maxine's sprite
    maxine.setVisible(false);

    // Create the explosion sprite at Maxine's position
    var explosion = this.add.sprite(maxine.x, maxine.y, 'boom1');
    explosion.setOrigin(0.5)

    // Play the boom animation
    explosion.play('boom');

    // Reset Maxine's position and re-enable movement after the explosion animation completes
    explosion.on('animationcomplete', function () {
        // Reset Maxine's position to the start position
        maxine.setPosition(maxineStart[0], maxineStart[1]);

        // Enable Maxine's movement
        maxine.setImmovable(false);
        maxine.body.enable = true;

        // Show Maxine's sprite
        maxine.setVisible(true);

        // Destroy the explosion sprite
        explosion.destroy();
    }, this);

    increaseConsoleScore(100);
}

function maxineHitsMushroom(maxine, mushroom) {
    // Play the "good" sound
    this.sound.play('good');
    increaseChallengerScore(100);
    mushroom.destroy();
}

function maxineHitsProjectile(maxine, projectile) {
    this.sound.play('eep');
    increaseConsoleScore(100);
    projectile.destroy();
}

function maxineHitsSpinshroom(maxine, spinshroom) {
    this.sound.play('eep');
    increaseConsoleScore(100);
    spinshroom.destroy();
}

function makeSpore(shroom, startMoving = true) {
    var spore = scene.physics.add.sprite(shroom.x, shroom.y, 'spore1');
    spore.setScale(0.25);
    spore.play('spore_anim');
    spore.setOrigin(0.5);


    // Add the spore to the projectiles group. This must be done before setting its speed
    // because adding it resets the speed to 0(!). See https://phaser.discourse.group/t/confused-about-physics-specifically-velocity/3019/2
    projectiles.add(spore);

    if (startMoving) {
        // Calculate the direction towards Maxine
        var direction = Math.atan2(player.y - spore.y, player.x - spore.x);

        // Set the spore's velocity based on the direction and speed. Velocity is in pixels per second!
        var speed = 3 * 60;
        spore.setVelocity(Math.cos(direction) * speed, Math.sin(direction) * speed);
        //console.log("speed", Math.cos(direction) * speed, Math.sin(direction) * speed);
    }


    debugWarn(console.log(`Spore created at (${spore.x}, ${spore.y})`));
}

function makeMushroom(angle) {
    var mush = this.physics.add.sprite(0, 0, 'pink_oyster1');
    mush.setScale(0.5);
    mush.play('mush_anim');
    mush.setOrigin(0.5);

    // Translate the Python lines to JavaScript
    var rotation = angle - 20;
    mush.spiral_state = new SpiralState(0.5, rotation, torusInnerHeight, 1, worldCenter, torusInnerWidth / torusInnerHeight);

    // Add the mushroom to the mushrooms group
    mushrooms.add(mush);

    // Start the spore timer for the mushroom
    mush.sporeTimer = this.time.addEvent({
        delay: Phaser.Math.Between(2500, 5000),
        callback: mushroomSporeTimer,
        callbackScope: this,
        args: [mush],
        loop: true
    });
}

function makeSpinner() {
    var side = (Math.random() > 0.5);

    // Make them start slightly inside the signal ring so they don't get
    // removed right away if they start on the left side
    var r = torusInnerRadius - 10;
    var theta = side ? 0 : 180;
    var x, y;
    [x, y] = pol2cart(r, theta);
    [x, y] = adjustCoords(x, y);

    var spinner = this.physics.add.sprite(x, y, 'spinshroom1');
    spinners.add(spinner);

    spinner.play('spinshroom_anim');
    spinner.setOrigin(0.5);
    spinner.setScale(0.2);

    var speed = 3 * 60;
    if (side)
        spinner.setVelocity(-speed, 0);
    else
        spinner.setVelocity(speed, 0);

}

function makeBouncer(angle) {
    var r = torusInnerRadius;
    var theta = angle;

    var x, y
    [x, y] = pol2cart(r, theta);
    [x, y] = adjustCoords(x, y);

    var bouncer = this.physics.add.sprite(x, y, 'purple_mushroom');
    bouncer.setOrigin(0.5);
    bounceOffWall(bouncer);
    bouncer._MQoldPos = [bouncer.x, bouncer.y];

    // Add the bouncer to the group
    bouncers.add(bouncer);
}

function makeCannon() {
    // Make the cannon/mushromancer at the center of the level.
    var cannon = scene.physics.add.sprite(worldCenter[0], worldCenter[1], 'mushromancer1');
    cannon.setOrigin(0.5);
    cannon.play('mushromancer_anim');
    cannons.add(cannon);
    cannon._MQshooting = false;

    // Start the spore timer for the cannon
    cannon._MQsporeTimer = scene.time.addEvent({
        delay: 1000,
        callback: makeSpore,
        callbackScope: this,
        args: [cannon, false],
        loop: true
    });
}

// Just for random mode
function addMonster() {
    // Add a spike to the Vertical Line Ring (VLR)
    // In random mode, visually mark the ring when a monster spawns.
    // In live mode, the ring already shows server-derived spikes.
    if (signalMode !== "live") {
        vlr.addSpike();
    }

    // Generate a random angle between 0 and 360 degrees
    var randomAngle = Phaser.Math.Between(0, 360);
    var randomNumber = Math.random();
    var ratio;

    if (level === 1 || level === 2 || level === 4) {

        ratio = (level === 1) ? 0.67 : 0.33;

        if (randomNumber > ratio) {
            makeSpinner.call(this);
        } else {
            // Call the makeMushroom function with the random angle
            makeMushroom.call(this, randomAngle);
        }
    } else if (level === 3 || level === 5) {
        ratio = 0.8;

        if (randomNumber > ratio) {
            makeSpinner.call(this);
        } else {
            makeBouncer.call(this, randomAngle);
        }
    }

    // Restart the monster timer with a new random delay
    // In random mode, keep timer-based pacing.
    // In live signal mode, spawns come from server spike events instead.
    if (signalMode !== "live") {
        monsterTimer.reset({
            delay: Phaser.Math.Between(2000, 6000),
            callback: addMonster,
            callbackScope: this,
            loop: true
        });
    }
}

function addMonsterFromSignal() {
    // Spawn near the signal ring cursor angle (where the latest packet was written)
    var signalAngle = 0;
    if (vlr && typeof vlr.getPresentAngle === "function") {
        signalAngle = vlr.getPresentAngle();
    }

    // Optional small jitter so repeated spawns don't stack perfectly
    var randomAngle = signalAngle + Phaser.Math.Between(-10, 10);
    if (randomAngle < 0) randomAngle += 360;
    if (randomAngle >= 360) randomAngle -= 360;
    
    // Default to medium if signal summary isn't ready yet
    var kind = "pink";
    if (typeof chooseMonsterTypeFromSignal === "function") {
        kind = chooseMonsterTypeFromSignal();
    }

    if (kind === "spin") {
        makeSpinner.call(this);
    } else if (kind === "doom") {
        makeBouncer.call(this, randomAngle);
    } else {
        // "pink" fallback
        makeMushroom.call(this, randomAngle);
    }

    sendGameMonsterSpawnedEvent(
        kind,
        randomAngle,
        "live_signal",
        getLatestSignalSummaryForRecording()
    );
}

function mushroomSporeTimer(mush) {
    // Check if the mushroom exists and is far enough from the player
    if (mush && mush.active && Phaser.Math.Distance.Between(mush.x, mush.y, player.x, player.y) > 300) {
        // Call the makeSpore function with the mushroom
        makeSpore.call(this, mush);
    }
}

// Called when purple musrhooms start at the wall or hit the wall after moving
function bounceOffWall(monster) {
    var newDirection = Phaser.Math.Between(0, 360);
    monster.angle = newDirection;
}

function pointOutsideSignalRing(point) {
    var rx = torusInnerWidth / 2;
    var ry = torusInnerHeight / 2;
    var scaledCoords = [point[0] - worldCenter[0],
    (point[1] - worldCenter[1]) * rx / ry];

    // Calculate the 2 norm because it's what StackOverflow told me to do. It's just the distance.
    var norm = distance_points(scaledCoords, [0, 0]);
    return norm > rx;
}

// Somehow doesn't do anything. I'm mystified.
function drawSpiral(rotation, graphics) {
    const gap = 0.5;
    const maxTheta = torusInnerHeight;
    const stepDegrees = 10;

    for (var theta = 0; theta < maxTheta; theta += stepDegrees) {
        var x, y;
        [x, y] = spiral(gap, rotation, theta);
        [x, y] = adjustCoords(x, y);
        graphics.fillCircle(x, y, 1);
    }
}

/** Just a prototype to set up a wall with collision */
function setupLabyrinth() {
    const wall = physics.add.staticSprite(300, 300, 'wall_horizontal');
    horizontalWalls.add(wall);
    console.log("Added wall");
}