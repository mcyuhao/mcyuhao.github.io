class Game {
    init() {
        // Prep canvas
        this.canvas = document.getElementById('canvas');
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.ctx = this.canvas.getContext('2d');
        this.canvasBounds = this.canvas.getBoundingClientRect();

        this._losCanvas = document.getElementById('los');
        this._losCanvas.width = this.canvas.width;
        this._losCanvas.height = this.canvas.height;
        this._losCtx = this._losCanvas.getContext('2d');

        this._tileCanvas = document.getElementById('tile');
        this._tileCtx = this._tileCanvas.getContext('2d');

        Asset.loadAllAssets();

        this.input = new Input({
            up: this.onUp.bind(this),
            down: this.onDown.bind(this),
            left: this.onLeft.bind(this),
            right: this.onRight.bind(this),
            toggle: this.onToggle.bind(this),
            escape: {
                // For the ESC key, wait until the user releases the key. This is simplistic
                // and slightly delays input, but is the easy to make sure that if we request
                // pointer lock, it won't be immediately released again by the browser.
                up: this.onEscape.bind(this)
            },
            mousemove: this.onMouseMove.bind(this),
            mouseclick: this.onMouseClick.bind(this)
        }).init();

        this.audio = new Audio();

        // Check whether local storage is writable.
        // Why not typeof()? See https://stackoverflow.com/questions/11214404/how-to-detect-if-browser-supports-html5-local-storage
        try {
            localStorage.setItem('lc', 7);
            localStorage.removeItem('lc');
        } catch (e) {
            this._storageDisabled = true;
        }

        if (this._storageDisabled) {
            this._startLevel = 0;
        } else {
            this._startLevel = parseInt(localStorage.getItem('level') || '0', 10);
        }

        this.level = undefined;
        this.intro = undefined;
        this.player = undefined;
        this.levelComplete = undefined;
        this.levelCompleteMs = undefined;

        this.framems = 0;
        this.enemies = [];

        this.crosshair = { x: 0, y: 0 };
        this.mouse = { x: 0, y: 0 };

        // How "deep" a player's vision cone cuts into a wall tile. Very important
        // that this be a global respected value, without it, the corners we are cutting
        // will result in e.g. light shining through the corners of moving doors.
        this.tileVisibilityInset = 4;

        // When "lock crosshair to map" is true, leaving mouse at rest and moving
        // with WASD will "strafe" (for example, moving around a raven in a circle
        // stay looking at the raven). The default is false, which means leaving the
        // mouse at rest will keep the player's orientation steady as you move.
        this.lockCrosshairToMap = false;

        // Yes, technically, facing and fov are properties of the player. But because
        // we treat the crosshair as a separate entity, it's easier to just make it
        // part of game state.
        this.facing = 0;
        this.fov = 120;

        this.mouselocked = false;
        this.paused = true;
        this._renderPrep = true;
        document.addEventListener('pointerlockchange', this.onMouseLock.bind(this));
        document.addEventListener('mozpointerlockchange', this.onMouseLock.bind(this));
        document.addEventListener('webkitpointerlockchange', this.onMouseLock.bind(this));

        this._startMenu = new Menu(
            [
                {
                    text: 'START NEW GAME',
                    handler: () => {
                        this._pendingLevelIndex = 0;
                        this.unpause();
                    }
                }
            ],
            () => false
        );

        this._continueMenu = new Menu(
            [
                {
                    text: 'CONTINUE GAME',
                    handler: () => {
                        this._pendingLevelIndex = this._startLevel;
                        this.unpause();
                    }
                },
                {
                    text: 'START NEW GAME',
                    handler: () => {
                        this._pendingLevelIndex = 0;
                        this.unpause();
                    }
                }
            ],
            () => false
        );

        this._pauseMenu = new Menu(
            [
                {
                    text: 'RESUME',
                    handler: () => {
                        this.unpause();
                    }
                },
                {
                    text: 'RESTART LEVEL',
                    handler: () => {
                        this._pendingLevelIndex = this.levelIndex;
                        this.unpause();
                    }
                }
            ],
            () => this.unpause()
        );

        return this;
    }

    update(delta) {
        if (typeof this._pendingLevelIndex !== 'undefined') {
            this._load(this._pendingLevelIndex);
            this._pendingLevelIndex = undefined;
        }

        this.audio.update(delta);

        if (this.menu) {
            this.menu.update(delta);
        } else if (this.intro) {
            this.intro.update(delta);
            if (this.intro.state === 'dead') {
                this.intro = undefined;
                if (this.level) {
                    // A "level" intro naturally transitions into the next level.
                    // No action needed.
                } else {
                    // If there's no level, then this is actually the outro, and
                    // the next step is the main menu. Note we always open the Start Menu,
                    // because there will be no continuing.
                    this.openMenu(this._startMenu);
                }
            }
            this.levelms = performance.now();
        } else if (this.level) {
            if (this.player.dead) {
                this.deathFrame++;
            }

            if (this.levelComplete && (this.framems - this.levelCompleteMs) > 2200) {
                this._pendingLevelIndex = this.levelIndex + 1;
                if (this._pendingLevelIndex >= LevelCache.length) {
                    this._pendingLevelIndex = undefined;
                    this.level = undefined;
                    this.intro = new Intro(LevelCache.outro);
                    this.intro.update(delta);
                    this._renderPrep = false;
                    this._startLevel = 0;
                    if (!this._storageDisabled) localStorage.setItem('level', 0);
                    return;
                } else {
                    if (!this._storageDisabled) localStorage.setItem('level', this._pendingLevelIndex);
                }
            }

            this.player.update(delta);
            this.terminals.forEach(terminal => terminal.update(delta));
            this.cameras.forEach(camera => camera.update(delta));
            this.doors.forEach(door => door.update(delta));

            this.offset = {
                x: this.canvas.width / 2 - this.player.x,
                y: this.canvas.height / 2 - this.player.y,
                crosshairX: this.player.x - this.canvas.width / 2,
                crosshairY: this.player.y - this.canvas.height / 2
            };

            let cd = 4;
            let bound = {
                left: this.offset.crosshairX + cd,
                right: this.offset.crosshairX + this.canvas.width - cd,
                top: this.offset.crosshairY + cd,
                bottom: this.offset.crosshairY + this.canvas.height - cd
            };

            if (this.crosshair.x < bound.left) {
                this.crosshair.x = bound.left;
            } else if (this.crosshair.x > bound.right) {
                this.crosshair.x = bound.right;
            }
            if (this.crosshair.y < bound.top) {
                this.crosshair.y = bound.top;
            } else if (this.crosshair.y > bound.bottom) {
                this.crosshair.y = bound.bottom;
            }

            this.facing = Util.atanPoints(this.player, this.crosshair);

            this.vision = [];
            let safe = false;
            if (Util.pointInBounds(this.player, this.level.enter)) {
                this.vision.push(Util.getVisBounds(this.level.enter, 0.69));
                safe = true;
            }
            if (Util.pointInBounds(this.player, this.level.exit)) {
                this.vision.push(Util.getVisBounds(this.level.exit, 0.69));
                safe = true;
            }
            this.cameras.forEach(camera => {
                if (camera.enabled) {
                    this.vision = this.vision.concat(Util.getVisCone(camera, camera.facing, camera.fov, 12, 0, 0.69));
                }
            });
            if (!this.player.dead) {
                this.vision = this.vision.concat(Util.getVisCone(this.player, this.facing, this.fov, 4, 0, 1));
            }

            this._buildAttackGrid();

            this.enemies.forEach(enemy => enemy.update(delta));
            this.enemies.forEach(enemy => Util.enforceEntityMovement(enemy));

            if (!this.player.dead) {
                this.enemies.forEach(enemy => {
                    if (Util.pointNearPoint(enemy, this.player, enemy.killRadius)) {
                        this.playerDied();
                    }
                });

                let activeTerminal = undefined;
                this.terminals.forEach(terminal => {
                    if (Util.pointNearPoint(terminal, this.player, terminal.toggleRadius)) {
                        activeTerminal = terminal;
                    }
                });
                this._activeTerminal = activeTerminal;

                if (!this.levelComplete && Util.pointInBounds(this.player, this.level.exit)) {
                    this.levelComplete = true;
                    this.levelCompleteMs = performance.now();
                    this.audio.playTri();
                }
            }

            this._renderPrep = true;
        }

        this._handleCheatCodes();
    }

    render() {
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.level && this._renderPrep && !this.intro) {
            if (this.player.dead) {
                let scale = Math.min(3, 1 + this.deathFrame / 50);
                this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
                this.ctx.rotate(Util.d2r(this.deathFrame / 5));
                this.ctx.scale(scale, scale);
                this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);
            }

            // "Draw" the pre-rendered level onto the canvas. Normally here we'd loop through
            // level width and height, drawing each tile, but that many drawImage calls is
            // way too slow.
            this.ctx.drawImage(this._tileCanvas, this.offset.x, this.offset.y);

            this.terminals.forEach(terminal => terminal.render());
            this.enemies.forEach(enemy => enemy.render());
            this.player.render();
            this.cameras.forEach(camera => camera.render());
            this.doors.forEach(door => door.render());

            // Uncomment this block to draw dashed yellow lines along the various
            // visibility edges. Pretty much just for debugging.
            /*let losEdges = this.losEdges;
            this.doors.forEach(door => losEdges = losEdges.concat(door.getLosEdges()));
            losEdges.forEach(edge => {
                this.ctx.save();
                this.ctx.globalAlpha = 0.9;
                this.ctx.strokeStyle = 'yellow';
                this.ctx.setLineDash([4, 2]);
                this.ctx.beginPath();
                this.ctx.moveTo(this.offset.x + edge.p1.x, this.offset.y + edge.p1.y);
                this.ctx.lineTo(this.offset.x + edge.p2.x, this.offset.y + edge.p2.y);
                this.ctx.stroke();
                this.ctx.restore();
            });*/

            if (this.player.dead) {
                this._losCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                let opacity = Math.max(0, 0.8 - this.deathFrame / 40);
                this._losCtx.fillStyle = 'rgba(0,0,0,' + opacity + ')';
                this._losCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }

            // Next, we "render" the LOS canvas
            this._losCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this._losCtx.fillStyle = 'rgba(0,0,0,0.8)';
            this._losCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.vision.forEach(polygon => {
                this._losCtx.fillStyle = 'rgba(255,255,255,' + polygon.opacity + ')';
                this._losCtx.beginPath();
                this._losCtx.moveTo(this.offset.x + polygon[0].x, this.offset.y + polygon[0].y);
                for (let i = 1; i < polygon.length; i++) {
                    this._losCtx.lineTo(this.offset.x + polygon[i].x, this.offset.y + polygon[i].y);
                }
                this._losCtx.closePath();
                this._losCtx.fill();
            });

            // Prepare to put LOS visibility on top of the canvas
            this.ctx.save();

            // LOS Blur actually looks REALLY nice in Chrome, gives your LOS beam a flashlight effect,
            // but it totally screws up frame rate. I'd have to really optimize the rest of my code
            // before I could turn on blur. (Uncomment if you want to check it out.)
            //this.ctx.filter = 'blur(6px)';

            // attempted: lighten, multiply, darken, source-in (darken looks best for shadows so far)
            this.ctx.globalCompositeOperation = 'darken';
            this.ctx.drawImage(this._losCanvas, 0, 0);
            this.ctx.restore();

            if (!this.player.dead) {
                this.player.renderCrosshair();

                // Interactivity indicator
                if (this._activeTerminal) {
                    Util.renderTogglePrompt(this.offset.x + this.player.x - 18, this.offset.y + this.player.y + 18);
                }
            }

            // Post-visibility rendering
            this.player.render(0.8);
            this.enemies.forEach(enemy => enemy.renderPost());

            // Reset all global transforms. Note: do not render anything except "HUD UI"
            // after this point, as it won't line up with the rest of the map in case of,
            // e.g., the death spin animation.
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);

            Enemy.renderAttackWarning();

            if (this.player.dead) {
                let mult = Math.min(1, this.deathFrame / 100);
                let b = -75 + mult * (this.canvas.height + 100);

                // A poor man's "blood splatter"
                this.ctx.fillStyle = 'rgba(204,0,0,0.8)';
                for (let i = 0; i < this.canvas.width; i++) {
                    this.ctx.fillRect(i, 0, 1,
                        b + Math.abs(Math.cos(i / 29) * 30 +
                        Math.sin(0.5 + i / 22) * 40 * mult +
                        Math.cos(i / 19) * 50 * mult +
                        Math.sin(i / 13) * 60 * mult +
                        Math.cos(i / 7) * 30 * mult)
                    );
                }

                /*let opacity = Math.min(0.8, this.deathFrame / 40);
                this.ctx.fillStyle = 'rgba(204, 0, 0, ' + opacity + ')';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);*/

                let size = Math.min(80, 20 + this.deathFrame / 5);
                let opacity = Math.min(0.5, this.deathFrame / 50);
                this.ctx.font = Asset.getFontString(size);
                let x = this.canvas.width / 2 - this.ctx.measureText('YOU ARE DEAD').width / 2;
                this.ctx.fillStyle = 'rgba(255, 255, 255, ' + opacity + ')';
                this.ctx.fillText('YOU ARE DEAD', x, this.canvas.height / 2);
            }

            if (this.levelComplete) {
                let opacity = Math.min(1, (game.framems - game.levelCompleteMs) / 2000);
                this.ctx.fillStyle = 'rgba(0, 0, 0, ' + opacity + ')';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                this.ctx.font = Asset.getFontString(40);
                let x = this.canvas.width / 2 - this.ctx.measureText('CLEAR').width / 2;
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                this.ctx.fillText('CLEAR', x, this.canvas.height / 2);
            }

            if (!this.menu) {
                this.renderLevelText();
            }
        }

        if (this.intro && !this.menu) {
            this.intro.render();
        }

        if (this.menu) {
            this.menu.render();
        }
    }

    renderLevelText() {
        let chars = Math.floor((this.framems - this.levelms) / 19);
        let nameChars = Math.min(this.level.name.length, chars);
        let hintChars = Math.max(0, chars - nameChars - 3);

        let delayStart = (this.level.hint.length + 3 + this.level.name.length) * 19;

        if (this.framems - this.levelms < delayStart) {
            // Text "scroll" audio effect
            this.audio.playClick();
        }

        if (this.framems - this.levelms - delayStart < 3000) {
            this.ctx.font = Asset.getFontString(22);
            this.ctx.fillStyle = 'rgba(204, 255, 204, 0.9)';
            this.ctx.fillText(this.level.name.substring(0, nameChars), 18, 36);

            if (this.level.hint) {
                this.ctx.font = Asset.getFontString(18);
                this.ctx.fillStyle = 'rgba(204, 204, 204, 0.8)';
                this.ctx.fillText(this.level.hint.substring(0, hintChars), 18, this.canvas.height - 30);
            }
        }
    }

    frame(nextms) {
        let delta = nextms - this.framems;
        this.framems = nextms;

        // Gut check - absorb random lag spike / frame jumps
        // (The expected delta is 1000/60 = ~16.67ms.)
        if (delta > 500) {
            delta = 500;
        }

        this.update(delta / 1000);
        this.render();

        window.requestAnimationFrame(this.frame.bind(this));
    }

    start() {
        if (this._startLevel > 0) {
            this.openMenu(this._continueMenu);
        } else {
            this.openMenu(this._startMenu);
        }
        window.requestAnimationFrame(this.frame.bind(this));
    }

    openMenu(menu) {
        this.menu = menu;
        this.menu.open();
    }

    playerDied() {
        this.player.dead = true;
        this.deathFrame = 0;
    }

    //
    // Event Handlers
    //

    unpause() {
        this.canvas.requestPointerLock();
    }

    onUp() {
        if (this.menu) this.menu.onUp();
    }

    onDown() {
        if (this.menu) this.menu.onDown();
    }

    onLeft() {
    }

    onRight() {
    }

    onToggle() {
        if (this.menu) {
            this.menu.select();
        } else if (this.intro) {
            this.intro.toggle();
        } else if (this.player.dead) {
            this._pendingLevelIndex = this.levelIndex;
        } else {
            let activeTerminal = this._activeTerminal;
            if (activeTerminal) {
                activeTerminal.toggle();
            }
        }
    }

    onEscape() {
        if (this.menu) {
            this.menu.onEscape();
        } else {
            // NOTE: My reading of the spec is that we should never reach this point, because
            // pressing ESC while we have no menu should be captured by the browser, and used
            // to release pointer lock.
            //
            // On Safari, it seems like (even though the hover bar says it will), the pointer lock
            // is never released. So we'll explicitly ask to release pointer lock, which will then
            // trigger the change handler below and open the pause menu.
            document.exitPointerLock();
        }
    }

    onMouseLock() {
        if (document.pointerLockElement === this.canvas) {
            this.mouselocked = true;
            this.paused = false;
            this.menu = undefined;
            this.framems = performance.now();
        } else {
            this.mouselocked = false;
            this.paused = true;
            this.openMenu(this._pauseMenu);
        }
    }

    onMouseMove(deltaX, deltaY, clientX, clientY) {
        if (!this.paused) {
            this.crosshair.x += deltaX;
            this.crosshair.y += deltaY;
        }

        this.mouse.x = clientX - this.canvasBounds.left;
        this.mouse.y = clientY - this.canvasBounds.top;

        if (this.menu) this.menu.onMouseMove(this.mouse.x, this.mouse.y);
    }

    onMouseClick() {
        if (this.menu) {
            this.menu.select();
        } else if (this.player.dead) {
            this._pendingLevelIndex = this.levelIndex;
        }
    }

    _load(levelIndex) {
        this.levelIndex = levelIndex;
        this.level = Object.assign({}, LevelCache[levelIndex]);
        this.level.data = this._unpackData(this.level.data);
        this.levelComplete = false;

        let eb = this.level.enter;

        this.player = new Player();
        this.player.x = (eb.p1.x + eb.p2.x) / 2;
        this.player.y = (eb.p1.y + eb.p2.y) / 2;
        this.crosshair.x = this.player.x + (this.level.chx || 0);
        this.crosshair.y = this.player.y + (this.level.chy || -32);

        this._polygonizeLevel(this.level);

        this.enemies = [];
        this.level.e.forEach(enemyData => {
            let enemy = new Enemy(enemyData);
            this.enemies.push(enemy);
        });

        this.cameras = [];
        this.level.c.forEach(cameraData => {
            let camera = new Camera(cameraData);
            this.cameras.push(camera);
        });

        this.terminals = [];
        this.level.t.forEach(terminalData => {
            let terminal = new Terminal(terminalData);
            terminal.cameras = this.cameras.filter(camera => camera.control === terminal.control);
            this.terminals.push(terminal);
        });

        this.doors = [];
        this.level.d.forEach(doorData => {
            let door = new Door(doorData);
            this.doors.push(door);
        });

        // Pre-render static level. Rendering the entire tiled map ahead of time
        // saves us hundreds-thousands of drawImage calls per frame, which according
        // to Chrome perf is the biggest CPU hit in this game.
        this._tileCanvas.width = this.level.width * 32;
        this._tileCanvas.height = this.level.height * 32;
        this._tileCtx.fillStyle = 'black';
        this._tileCtx.fillRect(0, 0, this.level.width * 32, this.level.height * 32);

        for (let i = 0; i < this.level.height; i++) {
            for(let j = 0; j < this.level.width; j++) {
                let tile = Util.tileAtUV(j, i);
                if (tile === 1) {
                    Asset.drawSprite('wall', this._tileCtx, j * 32, i * 32);
                    this._renderTileNoise(1, j * 32, i * 32);
                } else if (tile === 2) {
                    // Rotate floor pieces in a predictable pattern.
                    let rot = ((i * 3 + j * 7) % 4) * 90;

                    this._tileCtx.save();
                    // Totally cheating... mute the floor a little bit.
                    this._tileCtx.globalAlpha = 0.81;
                    this._tileCtx.translate(j * 32 + 16, i * 32 + 16);
                    this._tileCtx.rotate(Util.d2r(rot));
                    Asset.drawSprite('floor', this._tileCtx, -16, -16);
                    this._tileCtx.restore();
                    this._renderTileNoise(2, j * 32, i * 32);
                }
            }
        }

        if (this.level.intro) {
            this.intro = new Intro(this.level.intro);
        } else {
            this.levelms = performance.now();
        }

        this._renderPrep = false;
    }

    _unpackData(data) {
        let result = [], v, c, l;
        for (let i = 0; i < data.length; i++) {
            v = data.charCodeAt(i) - 35;
            if (v >= 58) v--;
            c = v % 8;
            l = (v - c) / 8 + 1;
            for (let j = 0; j < l; j++) result.push(c);
        }
        return result;
    }

    _renderTileNoise(seed, x, y) {
        // Adding some noise makes most tiles look much more natural (easier on
        // the eyes), but it also explodes PNG size by an order of magnitude. Cheat
        // by saving the PNGs as mostly-solid-color and add noise in when we render
        // the level.
        //let seeded = Util.Alea(seed);
        //let rand = () => Math.floor(seeded() * 256);
        let r,g,b,a,w;
        for (let i = 1; i < 31; i++) {
            for(let j = 1; j < 31; j++) {
                if (Util.rf(100) > 40) {
                    r = g = b = Util.rf(256);
                    a = Util.rf(0.2 * 100) / 100;
                    w = 1;
                    this._tileCtx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
                    this._tileCtx.fillRect(x + j, y + i, w, 1);
                }
            }
        }
    }

    // Warning: brute force incoming...
    //
    // Given a tiled level, precalculate a set of wall-floor "edges". More generally,
    // an "edge" is a straight line that divides a non-vision-blocking area from a
    // vision-blocking area.
    //
    // (Doors are dynamic and are not included in this phase.)
    _polygonizeLevel(level) {
        let edges = {};
        let addedge = (x1,y1,x2,y2,type) => {
            let key1 = `${x1},${y1}${type}`;
            let key2 = `${x2},${y2}${type}`;
            let existingEdge = edges[key1];
            if (existingEdge) {
                delete edges[key1];
                edges[key2] = [existingEdge[0], existingEdge[1], x2, y2];
            } else {
                edges[key2] = [x1, y1, x2, y2];
            }
        };

        // Loop through all floor tiles, checking for adjacent wall tiles, and
        // create or extend an LOS edge whenever we find one.
        for (let i = 0; i < level.height; i++) {
            for(let j = 0; j < level.width; j++) {
                let value = level.data[i * level.width + j];
                // value=2 is floor "non light obstructing"
                if (value !== 2) {
                    continue;
                }
                if (level.data[i * level.width + j - 1] !== 2) {
                    // left edge
                    addedge(j * 32, i * 32, j * 32, i * 32 + 32, 'left');
                }
                if (level.data[i * level.width + j + 1] !== 2) {
                    // right edge
                    addedge(j * 32 + 32, i * 32, j * 32 + 32, i * 32 + 32, 'right');
                }
                if (level.data[(i - 1) * level.width + j] !== 2) {
                    // top edge
                    addedge(j * 32, i * 32, j * 32 + 32, i * 32, 'top');
                }
                if (level.data[(i + 1) * level.width + j] !== 2) {
                    // bottom edge
                    addedge(j * 32, i * 32 + 32, j * 32 + 32, i * 32 + 32, 'bottom');
                }
            }
        }

        // More brute force (there should be something more elegant, surely?). We don't
        // always want our visibility to end _right_ at the edge of a tile, perhaps we'd
        // like to cut into the tile; but our simplistic algorithm above doesn't distinguish
        // between concave and convex corners. So we make up a bit of the legwork here.
        this.losEdges = Object.keys(edges).map(k => {
            let ax = 0, bx = 0, ay = 0, by = 0, flip = false;
            let cut = this.tileVisibilityInset;

            if (k.endsWith('left')) {
                ax = bx = -cut;
                ay = -cut;
                by = cut;
                flip = true;
                if (!Util.wallAtXY(edges[k][0] + ax, edges[k][1] + ay)) ay = -ay;
                if (!Util.wallAtXY(edges[k][2] + bx, edges[k][3] + by)) by = -by;
            } else if (k.endsWith('right')) {
                ax = bx = cut;
                ay = -cut;
                by = cut;
                if (!Util.wallAtXY(edges[k][0] + ax, edges[k][1] + ay)) ay = -ay;
                if (!Util.wallAtXY(edges[k][2] + bx, edges[k][3] + by)) by = -by;
            } else if (k.endsWith('top')) {
                ay = by = -cut;
                ax = -cut;
                bx = cut;
                if (!Util.wallAtXY(edges[k][0] + ax, edges[k][1] + ay)) ax = -ax;
                if (!Util.wallAtXY(edges[k][2] + bx, edges[k][3] + by)) bx = -bx;
            } else if (k.endsWith('bottom')) {
                ay = by = cut;
                ax = -cut;
                bx = cut;
                flip = true;
                if (!Util.wallAtXY(edges[k][0] + ax, edges[k][1] + ay)) ax = -ax;
                if (!Util.wallAtXY(edges[k][2] + bx, edges[k][3] + by)) bx = -bx;
            }

            let result = {
                p1: {
                    x: edges[k][0] + ax,
                    y: edges[k][1] + ay
                },
                p2: {
                    x: edges[k][2] + bx,
                    y: edges[k][3] + by
                }
            };

            // Definitely room for improvement here (and in this whole function). I've managed
            // to scrape together something that works, but making it work in the general case
            // (and correctly) is beyond me in 30 days :).
            //
            // This "flips" the appropriate edges so that ALL edges produced by this function
            // are clockwise (that is: following the edge from p1->p2 should always have floor
            // on the LEFT side and wall on the RIGHT side). This allows us to make a lot of
            // time-saving assumptions in the pathing phase.
            if (flip) [result.p1, result.p2] = [result.p2, result.p1];

            return result;
        });
    }

    // Cheat codes are disabled for submission. They are more of a development tool than
    // actually useful for playing. (Actually, I think cheat codes are kind of a fun
    // easter egg, but I needed those extra bytes!)
    _handleCheatCodes() {
        /*
        // GOTOnn (nn = 01-99, number of a valid level)
        if (this.input.queue[0] >= '0' && this.input.queue[0] <= '9' &&
            this.input.queue[1] >= '0' && this.input.queue[1] <= '9' &&
            this.input.queue[2] === 'o' &&
            this.input.queue[3] === 't' &&
            this.input.queue[4] === 'o' &&
            this.input.queue[5] === 'g') {
            this._pendingLevelIndex = parseInt(this.input.queue[1] + this.input.queue[0], 10) - 1;
            if (this._pendingLevelIndex >= LevelCache.length || this._pendingLevelIndex < 0) {
                this._pendingLevelIndex = undefined;
            }
            this.input.queue = [];
        // DEAD
        } else if (this.input.queue[0] === 'd' &&
                   this.input.queue[1] === 'a' &&
                   this.input.queue[2] === 'e' &&
                   this.input.queue[3] === 'd') {
            this.playerDied();
            this.input.queue = [];
        }
        */
    }

    // This is what I ended up with instead, which is a basic map "flood fill". Because
    // none of my levels are very large, I didn't really have to implement an A* or
    // anything, I just do basic breadth-first search of the map.
    _buildAttackGrid() {
        let target = {
            x: game.player.x - Util.cos(game.facing) * 34,
            y: game.player.y - Util.sin(game.facing) * 34,
        };

        let pu = Math.floor(target.x / 32);
        let pv = Math.floor(target.y / 32);
        let open = [[pu, pv, 2]];
        let grid = [];

        const examine = (u, v, c) => {
            if (Util.wallAtUV(u, v)) {
                grid[v * this.level.width + u] = 50000;
                return;
            }

            let priorCost = grid[v * this.level.width + u];

            if (!(u === pu && v === pv) && Util.pointSpottedXY(u * 32 + 16, v * 32 + 16)) {
                c += 10000;
            }

            if (!priorCost || c < priorCost) {
                grid[v * this.level.width + u] = c;
                open.push([u - 1, v, c + 32]);
                open.push([u + 1, v, c + 32]);
                open.push([u, v - 1, c + 32]);
                open.push([u, v + 1, c + 32]);
            }
        }

        while(open.length > 0) {
            let tile = open.shift();
            examine(tile[0], tile[1], tile[2]);
        }

        this.attackGrid = grid;
    }
}
