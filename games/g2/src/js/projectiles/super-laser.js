class SuperLaser extends Laser {

    constructor(owner, x, y, angle) {
        super(owner, x, y, angle);
        this.speed = 800;
        this.clock = 0;
        this.radius = 15;
        this.damage = 0.5;
        this.heat = 0.5;
    }

    cycle(e) {
        super.cycle(e);

        const s = sin((this.clock += e) * TWO_PI * 4) * 0;

        const d = 0.5;
        particle('red', [
            ['alpha', 1, 0, d],
            ['size', 16, rnd(16, 32), d],
            ['x', this.x + cos(this.angle + PI / 2) * s * 10, this.x + cos(this.angle + PI / 2) * s * 10 + rnd(-16, 16), d],
            ['y', this.y + sin(this.angle + PI / 2) * s * 10, this.y + sin(this.angle + PI / 2) * s * 10 + rnd(-16, 16), d]
        ]);
    }

    render() {
        translate(this.x, this.y);
        rotate(this.angle);

        fs('red');
        fr(-5, -5, 10, 10);
    }

}
