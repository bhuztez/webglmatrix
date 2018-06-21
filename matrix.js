/* glmatrix, Copyright (c) 2003, 2004 Jamie Zawinski <jwz@jwz.org>
 *
 * Permission to use, copy, modify, distribute, and sell this software and its
 * documentation for any purpose is hereby granted without fee, provided that
 * the above copyright notice appear in all copies and that both that
 * copyright notice and this permission notice appear in supporting
 * documentation.  No representations are made about the suitability of this
 * software for any purpose.  It is provided "as is" without express or
 * implied warranty.
 *
 * GLMatrix -- simulate the text scrolls from the movie "The Matrix".
 *
 * This program does a 3D rendering of the dropping characters that
 * appeared in the title sequences of the movies.  See also `xmatrix'
 * for a simulation of what the computer monitors actually *in* the
 * movie did.
 */
"use strict";

function frand(n) {
    return Math.random() * n;
}

function bellrand(n) {
    return (frand(n) + frand(n) + frand(n))/3;
}

function random(n) {
    return Math.floor(frand(n));
}

function* tick(speed) {
    while(true) {
        for(let i of range(speed))
            yield false;
        yield true;
    }
}

function *fps_counter() {
    let times = [];

    for(let frame of frames())
        yield frame.then(
            function(time) {
                while(times.length && (times[0] + 10000 < time))
                    times.shift();
                let result = (times.length)?Math.floor(1000*times.length/(time - times[0])):null;
                times.push(time);
                return result;
            }
        );
}

function matrix(CONFIG) {
    const VERTEX_SHADER = `
in vec2 p, t;
in float x,y,z,s,w,g;
out vec2 c;
out float b;
uniform vec2 VIEW;
uniform int ENCODING[36];
uniform float GRID_SIZE, GRID_DEPTH, SPLASH_RATIO, WAVE_SIZE, ASPECT;

float ramp(float ratio) {
  return mix(1.0, sin(radians(90.0*ratio)), 0.2);
}

bool xor(bool a, bool b) {
  return (a||b)&&!(a&&b);
}

void main() {
  float i = mod(float(gl_InstanceID), GRID_SIZE+1.0);
  bool spinner_p = (i == GRID_SIZE), time_p = (g<208.0);

  mat4 projection = perspective(radians(80.0), ASPECT, 1.0, 100.0);
  mat4 modelView = lookat(vec3(0.0,0.0,25.0), vec3(0.0), vec3(0.0,1.0,0.0));
  mat4 rotation = rotate(radians(VIEW.x), vec3(1.0,0.0,0.0)) * rotate(radians(VIEW.y), vec3(0.0,1.0,0.0));
  gl_Position = projection * modelView * rotation * vec4(p+vec2(x, y-(spinner_p?abs(s):i)), z, 1.0);

  b = time_p?2.0:spinner_p?1.5:ramp(fract((i+GRID_SIZE-w)/WAVE_SIZE));
  b *= xor(i*sign(s)<s, spinner_p)?mix(1.0, (z/GRID_DEPTH)+0.5, 0.2):0.0;
  b *= (z>GRID_DEPTH/2.0)?ramp(clamp((z/GRID_DEPTH-0.5)/(SPLASH_RATIO-0.5), 0.0, 1.0)):1.0;

  float glyph = time_p?g:float(ENCODING[int(g-208.0)]);
  c = time_p?vec2(t.y, 1.0-t.x):vec2(1.0-t.x, t.y);
  c = (c + vec2(mod(glyph,16.0), floor(glyph/16.0)))/vec2(16.0, 13.0);
}`;

    const FRAGMENT_SHADER = `
out vec4 color;
in vec2 c;
in float b;
uniform sampler2D TEXTURE;

void main() {
  color = texture(TEXTURE, c) * vec4(vec3(1.0), b);
}`;

    const MODES = {
        mat: [ 0,26],
        dec: [16,26],
        hex: [16,32],
        bin: [16, 2],
        dna: [32, 4],
    };

    const ENCODING = [
        160, 161, 162, 163, 164, 165, 166, 167,
        168, 169, 170, 171, 172, 173, 174, 175,
        16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
        33, 34, 35, 36, 37, 38, 33, 35, 39, 52,
    ];

    const NICE_VIEWS = [
        [  0,  0], [  0,-20],
        [  0, 20], [ 25,  0],
        [-25,  0], [ 25, 20],
        [-25, 20], [ 25,-20],
        [-25,-20], [ 10,  0],
        [-10,  0], [  0,  0],
        [  0,  0], [  0,  0],
        [  0,  0], [  0,  0],
    ];

    const NSTRIPS = CONFIG.NSTRIPS || 44;
    const GRID_SIZE = CONFIG.GRID_SIZE || 70;
    const GRID_DEPTH = CONFIG.GRID_DEPTH || 35;
    const WAVE_SIZE = CONFIG.WAVE_SIZE || 22;
    const SPLASH_RATIO = CONFIG.SPLASH_RATIO || 0.7;
    const SPEED = CONFIG.SPEED || 1.0;
    const GLYPH = ((m) => () => 208 + m[0] + random(m[1]))(MODES[CONFIG.MODE || 'mat']);
    const INSTANCES = (GRID_SIZE + 1) * NSTRIPS;

    function* auto_track() {
        let v = [NICE_VIEWS[0], NICE_VIEWS[0]];
        const track = tick(20/SPEED);

        for(let steps=100; ;steps=350/SPEED) {
            while ((!track.next().value) || random(20))
                yield v[0];

            for(let i of range(steps)) {
                const th = Math.sin(Math.PI/2 * i/steps);
                yield [0,1].map(j => v[0][j]*(1-th)+v[1][j]*th);
            }

            v = [v[1], NICE_VIEWS[random(NICE_VIEWS.length)]];
        }
    }

    function* strip(i) {
        while(true) {
            const x = frand(GRID_SIZE) - (GRID_SIZE/2);
            const y = (GRID_SIZE/2) + bellrand(0.5);
            let z = (GRID_DEPTH*0.2) - frand(GRID_DEPTH*0.7);
            const dz = bellrand(0.02) * SPEED;

            let s = 0;
            let ds = bellrand(0.3) * SPEED;
            const spin = tick(bellrand(2.0/SPEED) + 1);

            let w = 0;
            const wave = tick(bellrand(3.0/SPEED) + 1);

            const glyphs = new Uint8Array(GRID_SIZE+1);
            const spins = new Set(Array.from(range(GRID_SIZE+1)).filter(j => (!((j<GRID_SIZE)&&random(20)))));

            function update_glyph(j,n) {
                if ((j<GRID_SIZE)&&!random(n))
                    spins.delete(j)
                else
                    glyphs[j]=GLYPH()
            }

            for(let j of range(GRID_SIZE+1))
                update_glyph(j, 7);

            if (!random(5)) {
                const time = new Date().toString();
                const offset = random(GRID_SIZE - time.length);
                for(let j of range(time.length))
                    spins.delete(offset + j);
                glyphs.set(Array.from(time, c => c.charCodeAt(0)-0x20), offset);
            }

            yield [{x,y,z,s,w}, glyphs];

            for( ;(z<GRID_DEPTH*SPLASH_RATIO) && (s>-GRID_SIZE);z+=dz,s+=ds) {
                if (s >= GRID_SIZE) {
                    s = -0.001;
                    ds = -ds/2;
                }

                if (spin.next().value)
                    for(let j of spins.values())
                        update_glyph(j, 800);

                if (wave.next().value)
                    w = (w+1) % WAVE_SIZE;

                yield [{z,s,w}, glyphs];
            }
        }
    }

    return async function(gl) {
        const {load_program, init_texture, Buffer} = glutils(gl);
        const {attrib, uniform} = load_program({VERTEX_SHADER, FRAGMENT_SHADER});

        const texture = init_texture(0, [0, 128, 0, 128]);
        const image = new Image();
        image.addEventListener(
            'load',
            function() {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            }
        );
        image.src = 'matrix3.png';

        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clearDepth(1.0);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.enable(gl.BLEND);

        const positions = [ 0, 0, 1, 0, 0, 1, 1, 1 ];
        const texcoords = [ 0, 1, 1, 1, 0, 0, 1, 0 ];
        const indices   = [ 0, 1, 2, 2, 1, 3 ];

        const arrays = {
            x: new Float32Array(NSTRIPS),
            y: new Float32Array(NSTRIPS),
            z: new Float32Array(NSTRIPS),
            s: new Float32Array(NSTRIPS), // spinner_y
            w: new Uint8Array(NSTRIPS),   // wave_position
            g: new Uint8Array(INSTANCES), // glyph
            p: new Float32Array(positions),
            t: new Float32Array(texcoords),
        };

        const buffers = {};
        for (let [k,v] of Object.entries(arrays))
            buffers[k] = new Buffer(gl.ARRAY_BUFFER, v);

        for (let [k,v] of Object.entries({TEXTURE: 0, SPLASH_RATIO, WAVE_SIZE, GRID_SIZE, GRID_DEPTH, ENCODING}))
            uniform[k](v);

        for (let name of 'pt')
            attrib[name](buffers[name]);

        for (let name of 'xyzswg')
            attrib[name](buffers[name], INSTANCES);

        new Buffer(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices)).update(gl.STATIC_DRAW);

        function resize() {
            const width = window.innerWidth;
            const height = window.innerHeight;
            gl.canvas.width = width;
            gl.canvas.height = height;
            gl.viewport(0,0,width,height);
            uniform.ASPECT(width/height);
        }
        window.addEventListener('resize', resize);
        resize();

        const STRIPS = Array.from(range(NSTRIPS), i => strip(i));
        const at = auto_track();

        for(let frame of fps_counter()) {
            const fps = await frame;
            if (fps !== null)
                document.title = fps + " FPS";

            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            uniform.VIEW(at.next().value);

            for (let i of range(NSTRIPS)) {
                let [d, g] = STRIPS[i].next().value;
                buffers.g.data.set(g, i * (GRID_SIZE + 1));

                for(let [k,v] of Object.entries(d))
                    buffers[k].data[i] = v;
            }

            for (let name of 'xyzswg')
                buffers[name].update(gl.DYNAMIC_DRAW);

            gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, INSTANCES);
        }
    };
}

window.addEventListener('load', function() {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext("webgl2");
    matrix({})(ctx).catch((reason) => console.log(reason))
});
