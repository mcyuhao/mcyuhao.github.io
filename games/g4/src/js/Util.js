/**
 * Util contains a whole bunch of generic stuff used by other modules. Where possible,
 * I've stuck most of the math and algorithm stuff (visibility, flood fill, etc.) into
 * this module, along with some often-used tile checks, point checks, etc.
 */
const Util = {
    //
    // Various math helpers
    //

    atan(y, x) {
        return Util.r2d(Math.atan2(y, x));
    },

    atanPoints(p1, p2) {
        return Util.atan(p2.y - p1.y, p2.x - p1.x);
    },

    // cos (degrees)
    cos(d) {
        return Math.cos(Util.d2r(d));
    },

    // sin (degrees)
    sin(d) {
        return Math.sin(Util.d2r(d));
    },

    // radians to degrees
    r2d(r) {
        return Math.floor(r * 3600 / Math.PI / 2) / 10;
    },

    // degrees 2 radians
    d2r(d) {
        return d * Math.PI * 2 / 360;
    },

    // degree wrap
    dw(d) {
        return (d + 720) % 360;
    },

    // rand floor
    rf(x) {
        return Math.floor(Math.random() * x);
    },

    //
    // Points
    //

    distance(p1, p2) {
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    },

    pointNearPoint(p1, p2, range) {
        return (Util.distance(p1, p2) <= range);
    },

    // Return true if point is inside given triangle. This particular version
    // is an implementation of the barycentric coordinate check.
    pointInTriangle(p, t1, t2, t3) {
        let d = (t2.y - t3.y) * (t1.x - t3.x) + (t3.x - t2.x) * (t1.y - t3.y);
        let a = ((t2.y - t3.y) * (p.x - t3.x) + (t3.x - t2.x) * (p.y - t3.y)) / d;
        let b = ((t3.y - t1.y) * (p.x - t3.x) + (t1.x - t3.x) * (p.y - t3.y)) / d;
        let c = 1 - a - b;

        return 0 <= a && a <= 1 && 0 <= b && b <= 1 && 0 <= c && c <= 1;
    },

    pointSpottedXY(x, y) {
        for (let i = 0; i < game.vision.length; i++) {
            if (Util.pointInPolygon({ x, y }, game.vision[i])) return true;
        }
        return false;
    },

    entitySpotted(entity) {
        let dx = entity.width / 2;
        let dy = entity.height / 2;

        // 5 point check (center, each corner)
        return Util.pointSpottedXY(entity.x, entity.y) ||
            Util.pointSpottedXY(entity.x - dx, entity.y - dy) ||
            Util.pointSpottedXY(entity.x + dx, entity.y + dy) ||
            Util.pointSpottedXY(entity.x - dx, entity.y + dy) ||
            Util.pointSpottedXY(entity.x + dx, entity.y - dy);
    },

    // Return true if the given point is within the specified polygon. This algorithm
    // is a simple even-odd check.
    //
    // See:
    //   https://en.wikipedia.org/wiki/Even%E2%80%93odd_rule
    //   https://www.geeksforgeeks.org/how-to-check-if-a-given-point-lies-inside-a-polygon/
    //
    pointInPolygon(p, polygon) {
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i++) {
            if ((polygon[i].y > p.y) !== (polygon[j].y > p.y) &&
                p.x < polygon[i].x + (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y))
                inside = !inside;
        }

        return inside;
    },

    pointInBounds(p, bounds, fudge) {
        fudge = fudge || 0;
        let a = bounds.p1.x, b = bounds.p2.x, c = bounds.p1.y, d = bounds.p2.y;
        if (a > b) [a, b] = [b, a];
        if (c > d) [c, d] = [d, c];
        return p.x >= a - fudge && p.x <= b + fudge && p.y >= c - fudge && p.y <= d + fudge;
    },

    // Calculating visibility

    // Math wizards everywhere, avert your eyes...
    // https://www.topcoder.com/community/data-science/data-science-tutorials/geometry-concepts-line-intersection-and-its-applications/
    // Intersecting lines...
    // First, given (x1,y1)->(x2,y2), Ax+By=C.
            // A = y2-y1
            // B = x1-x2
            // C = Ax1+By1
    intersection(line1, line2) {
        let A1 = line1.p2.y - line1.p1.y;
        let B1 = line1.p1.x - line1.p2.x;
        let C1 = A1 * line1.p1.x + B1 * line1.p1.y;

        let A2 = line2.p2.y - line2.p1.y;
        let B2 = line2.p1.x - line2.p2.x;
        let C2 = A2 * line2.p1.x + B2 * line2.p1.y;

        let det = A1*B2 - A2*B1;

        if (det !== 0) {
            let p = {
                x: (B2*C1 - B1*C2)/det,
                y: (A1*C2 - A2*C1)/det
            };

            if (Util.pointInBounds(p, line1, 1) && Util.pointInBounds(p, line2, 1)) {
                return p;
            }
        }
    },

    getVisCone(origin, facing, coneAngle, offset, backwalk, opacity) {
        // Get pre-calculated visibility edges
        let edges = game.losEdges;

        // Add in dynamic visibility edges
        game.doors.forEach(door => edges = edges.concat(door.getLosEdges()));

        let startAngle = Util.dw(facing - coneAngle / 2);
        let endAngle = Util.dw(facing + coneAngle / 2);

        if (endAngle < startAngle) endAngle += 360;

        // How much space between the "origin point" and the arc of vision? Imagine
        // for example, a security camera (the arc of vision starts at the lens,
        // not the base of the camera).
        offset = offset || 0;

        // Backwalk - how many pixels to walk "backwards" before casting rays. Sometimes
        // you need some pixels of backwalk to prevent the arc of vision from being
        // too far in front of the subject (mostly it just doesn't look good).
        backwalk = backwalk || 0;

        // Calculate a new temporary origin point, with backwalk taken into account.
        origin = {
            x: origin.x - Math.cos(Util.d2r(facing)) * backwalk,
            y: origin.y - Math.sin(Util.d2r(facing)) * backwalk
        };

        // Gap between rays cast. More of an art than a science... a higher gap is faster,
        // but potentially introduces artifacts at corners.
        let sweep = 0.8;

        // Shadows actually seem a little unnatural if they are super crisp. Introduce
        // just enough jitter that the user won't see a sharp unmoving line for more
        // than ~1sec.
        //
        // TODO: jitter is disabled, it doesn't look quite right.
        //let jitter = (game.framems % 1000) / 1000;

        let polygon = [];

        let angle = startAngle; //+ jitter;
        while (angle < endAngle) {
            // Calculate a source, taking the offset into account
            let source = {
                x: origin.x + Math.cos(Util.d2r(angle)) * offset,
                y: origin.y + Math.sin(Util.d2r(angle)) * offset
            };

            // Calculate the ray endpoint
            let ray = {
                x: origin.x + Math.cos(Util.d2r(angle)) * 1000,
                y: origin.y + Math.sin(Util.d2r(angle)) * 1000
            };

            // Loop through all known LOS edges, and when we intersect one, shorten
            // the current ray. TODO: This is a potential area of improvement (edge
            // culling, early exits, etc.).
            for (let j = 0; j < edges.length; j++) {
                let inter = this.intersection({ p1: source, p2: ray }, edges[j]);
                if (inter) {
                    ray = inter;
                }
            }

            // In theory, this is where we would keep an array of vision polygons,
            // each one being:
            //
            //     [lastSource, source, ray, lastRay]
            //
            // (If offset=0, then we could further optimize and just save the vision
            // polygons as triangles, but using triangles when source changes for each
            // ray results in ugly lines near the player.)
            //
            // Rather than keep polygons at all, though, we can just "sweep" forwards
            // for each point far from the player (the ray) and "sweep" backwards for
            // each point near the player (the source). Concatenating all these points
            // together then produces a single polygon representing the entire field of
            // vision, which we can draw in a single fill call.
            //
            // Note order is important: we need the final polygons to be stored with
            // edges "clockwise" (in this case, we are optimizing for enemy pathing, which
            // means we want NON-VISIBLE on the left and VISIBLE on the right).
            polygon.unshift(ray);
            polygon.push(source);

            angle += sweep;
        }

        polygon.opacity = opacity;
        return [polygon];
    },

    getVisBounds(bounds, opacity) {
        let polygon = [
            { x: bounds.p1.x, y: bounds.p1.y },
            { x: bounds.p2.x, y: bounds.p1.y },
            { x: bounds.p2.x, y: bounds.p2.y },
            { x: bounds.p1.x, y: bounds.p2.y }
        ];
        polygon.opacity = opacity;
        return polygon;
    },

    //
    // Map-related
    //

    tileAtUV(u, v) {
        return game.level.data[v * game.level.width + u];
    },

    tileAtXY(x, y) {
        return Util.tileAtUV(Math.floor(x / 32), Math.floor(y / 32));
    },

    wallAtUV(u, v) {
        return Util.tileAtUV(u, v) !== 2;
    },

    wallAtXY(x, y) {
        return Util.wallAtUV(Math.floor(x / 32), Math.floor(y / 32));
    },

    doorAtXY(x, y) {
        let door, u = Math.floor(x / 32), v = Math.floor(y / 32);
        for (let i = 0; i < game.doors.length; i++) {
            if ((game.doors[i].u === u && game.doors[i].v === v) ||
                (game.doors[i].u === u - 1 && game.doors[i].v === v)) {
                door = game.doors[i];
                break;
            }
        }

        if (door && door.slide < 10) {
            if (y % 32 > 3 && y % 32 < 28) return true;
        }

        return false;
    },

    enforceEntityMovement(entity) {
        // Todo: should terminals have a small hit box so you can't just walk through them?
        // It'd be more realistic, but I don't think it's a must-have...

        function check(x, y, dirX, dirY, offset) {
            if (Util.wallAtXY(x, y)) {
                entity.x += dirX * offset;
                entity.y += dirY * offset;
            } else if (Util.doorAtXY(x, y)) {
                entity.x += dirX * (offset - 4);
                entity.y += dirY * (offset - 4);
            }
        }

        check(entity.x - entity.width / 2, entity.y, 1, 0, 32 - ((entity.x - entity.width / 2) % 32));
        check(entity.x + entity.width / 2, entity.y, -1, 0, ((entity.x + entity.width / 2) % 32));
        check(entity.x, entity.y - entity.height / 2, 0, 1, 32 - ((entity.y - entity.height / 2) % 32));
        check(entity.x, entity.y + entity.height / 2, 0, -1, ((entity.y + entity.height / 2) % 32));
    },

    renderTogglePrompt(x, y) {
        let radius = (game.framems % 1000 < 500 ? 4 : 6);
        game.ctx.fillStyle = 'rgba(204, 204, 204, 168)';
        game.ctx.strokeStyle = 'rgba(204, 204, 204, 168)';
        game.ctx.beginPath();
        game.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        game.ctx.fill();
        game.ctx.beginPath();
        game.ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
        game.ctx.stroke();
    }
};
