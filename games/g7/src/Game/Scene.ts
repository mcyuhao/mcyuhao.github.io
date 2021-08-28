import { Event } from "./Event";
import { Hero } from "./Hero";
import { Map } from "./Map";
import { Platform } from "./Platform";
import { Item } from "../T3D/index";

export class Scene extends Item {

    hero: Hero;
    map: Map; // platform bit map
    row: number; // active row
    index: number; // active platform
    planet: number; // active planet
    planets: HTMLCollectionOf<Element>;
    platforms: Platform[];

    constructor(hero: Hero, factory: () => Platform, map: Map) {
        super();
        this.map = map;
        this.hero = hero;
        this.add(this.hero);
        this.planets = document.getElementsByTagName('LI');
        this.platforms = [];
        for (let i = 0; i < 33; i++) {
            let platform = factory();
            this.platforms.push(platform);
            this.add(platform);
        }
        this.init();
    }

    init() {
        this.row = 9;
        this.hero.init();
        this.map.init();
        let i = 0;
        for (let z = -9; z < 2; z++) {
            for (let x = -1; x <= 1; x++) {
                let platform = this.platforms[i++];
                platform.transform.translate.set(x, -1, z);
                platform.enemy.active =
                platform.fence.active =
                platform.token.active = false;
                platform.block.active = true;
            }
        }
        this.planet = this.planets.length - 1;
        for (i = 0; i < this.planets.length; i++) {
            this.planets.item(i).className = '';
        }
    }

    next() {
        if (this.planet > 0) {
            this.planets.item(this.planet--).className = 'hide';
            Event.trigger('planet', this.planet);
        }
    }

    ended() {
        return Math.abs(this.hero.speed.z) < .01;
    }

    input(key: number): void {
        const hero = this.hero;
        switch (key) {
            case 37:
                hero.left();
                break;
            case 39:
                hero.right();
                break;
            case 38:
                hero.jump();
                break;
            case 40:
                hero.dash();
                break;
            case 32:
                hero.boost();
        }
    }

    updateRow(speed:number) {
        this.row -= speed;
        if (this.row <= -.5) {
            this.row += 11;
        }
        this.index = Math.round(this.row) * 3 + Math.round(this.hero.transform.translate.x) + 1;
    }

    getIndex(add: number = 0): number {
        let length = this.platforms.length,
            index = this.index + add;
        if (index < 0) {
            return index + length;
        }
        if (index >= length) {
            return index - length;
        }
        return index;
    }

    update() {
        this.hero.update();
        let rotate = false,
            hero = this.hero,
            speed = hero.speed.z,
            fence = 0,
            enemy = 0;
        this.platforms.forEach((platform, i) => {
            if (platform.update(speed)) {
                fence += platform.fence.active && hero.transform.translate.y > -1 ? 1 : 0;
                enemy += platform.enemy.active && !platform.enemy.stroke && !hero.stroke ? 1 : 0;
                let cfg = this.map.row[i % 3],
                    obj = cfg >> 2;
                platform.block.active = (cfg & 1) > 0;
                platform.transform.translate.y = (cfg & 2) > 0 ? 0 : -1;
                platform.token.init(obj == 1 || obj == 4);
                platform.fence.active = obj == 2;
                platform.enemy.init(obj == 3);
                platform.token.transform.rotate.y = 45;
                rotate = true;
            }
            platform.enemy.intersect(hero);
        });
        if (rotate && this.map.update()) {
            this.next();
        }
        this.updateRow(speed);
        hero.collide = this.platforms[this.getIndex()].intersect(hero);
        [-3, 3, -1, 1, -2, 2, -4, 4].forEach(add => {
            let index = this.getIndex(add),
                platform = this.platforms[index];
            platform.intersect(hero, add == 1 || add == -1);
        });
        hero.distance += speed;
        if (fence > 0) {
            Event.trigger('fence', fence);
        }
        if (enemy > 0) {
            Event.trigger('enemy', enemy);
        }
    }

}
