import { Event } from "./Event";
import { COLOR } from "../main";
import { Item, Vec3, Sphere } from "../T3D/index";

export class Hero extends Item {

    x: number;
    rad: number;
    acc: number;
    speed: Vec3;
    speedTime: number;
    scale: number;
    scaleTime: number;
    magnet: Vec3;
    magnetTime: number;
    distance: number;
    tokenCollider: Sphere;
    collide: Vec3;
    explode: number;

    init(reset: boolean = true) {
        const transform = this.transform;
        transform.translate.set(0, 0, 0);
        transform.rotate.set(0, 0, 90);
        transform.scale.set(1, 1, 1);
        this.color = COLOR.WHITE;
        this.active = true;
        this.transform = transform;
        this.collider = new Sphere(transform);
        this.tokenCollider = new Sphere(transform);
        this.x = 0;
        this.rad = .4;
        this.acc = -.015;
        this.speed = new Vec3(0, 0, .1);
        this.speedTime = 0;
        this.scale = .8;
        this.scaleTime = 0;
        this.magnet = new Vec3(5, 5, 5);
        this.magnetTime = 0;
        this.explode = 0;
        this.stroke = 0;
        if (reset) {
            this.distance = 0;
        }
    }

    left() {
        if (this.x >= 0) {
            this.x--;
            Event.trigger('move', this);
        }
    }

    right() {
        if (this.x <= 0) {
            this.x++;
            Event.trigger('move', this);
        }
    }

    jump() {
        if (this.collide) {
            this.acc = .03;
            Event.trigger('jump', this);
        }
    }

    boost() {
        this.speedTime = 75;
        Event.trigger('move', this);
    }

    magnetize() {
        this.magnetTime = 450;
        Event.trigger('power', this);
    }

    dash() {
        this.scaleTime = 40;
        Event.trigger('move', this);
    }

    coin() {
        Event.trigger('coin', this);
    }

    cancel() {
        this.x = Math.round(this.transform.translate.x);
    }

    update() {
        let pos = this.transform.translate,
            scale = this.scale,
            rotate = this.transform.rotate,
            speed = (this.speedTime ? .13 : .08) + Math.min(this.distance / 15000, .04);
        this.speed.z += ((this.active ? speed : 0) - this.speed.z) / 20;
        this.speedTime -= this.speedTime > 0 ? 1 : 0;
        this.color = this.magnetTime > 100 || this.magnetTime % 20 > 10 ? COLOR.PINK : COLOR.WHITE;
        this.scale += ((this.scaleTime ? .5 : .7) - this.scale) / 5;
        this.scaleTime -= this.scaleTime > 0 ? 1 : 0;
        this.magnetTime -= this.magnetTime > 0 ? 1 : 0;
        this.tokenCollider.scale = this.magnetTime ? this.magnet : this.transform.scale;
        this.stroke += (this.explode - this.stroke) / 25;
        this.active = pos.y > -10 && this.stroke < 6;
        if (!this.active || this.stroke) {
            return;
        }
        this.acc -= this.acc > -.012 ? .003 : 0;
        rotate.z = 90 + (pos.x - this.x) * 25;
        rotate.y = (rotate.y + this.speed.z * 100) % 360;
        this.speed.y += this.acc;
        if (this.speed.y < -.25) {
            this.speed.y = -.25;
        }
        pos.x += (this.x - pos.x) / 7;
        pos.y += this.speed.y;
        pos.z -= pos.z / 30;
        this.transform.scale.set(scale, scale, scale);
    }

    preview() {
        let rotate = this.transform.rotate;
        rotate.y = (rotate.y + 1) % 360;
        rotate.z = (rotate.z + .7) % 360;
    }

}
