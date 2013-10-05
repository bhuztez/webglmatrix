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


function compatAddEventListener(elem, event, listener) {
    if (elem.addEventListener)
        elem.addEventListener(event, listener, false);
    else if (elem.attachEvent)
        elem.attachEvent('on'+event, listener, false);
}

function compatHasFocus() {
    if (document.hasFocus)
        return document.hasFocus();
    return true;
}

function compatGetWidth() {
    return window.innerWidth ||
        document.documentElement.clientWidth;
}

function compatGetHeight() {
    return window.innerHeight ||
        document.documentElement.clientHeight;
}

function compatGetGLContext(canvas) {
    return canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl");
}

var compatRequestAnimationFrame =
    window.mozRequestAnimationFrame ||
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.msRequestAnimationFrame;

var compatCancelAnimationFrame =
    window.cancelAnimationFrame ||
    window.mozCancelAnimationFrame;

function compatAnimationStartTime() {
    return window.mozAnimationStartTime || 0;
}


function getPerspectiveMatrix(fovy, aspect, near, far) {
    var f = 1/Math.tan(fovy/2);
    var dz = near-far;

    return new Float32Array(
        [ f/aspect, 0,  0,                0,
          0,        f,  0,                0,
          0,        0,  (far+near)/dz,   -1,
          0,        0,  (far*near*2)/dz,  0]);
}

function getTranslateMatrix(z) {
    return new Float32Array(
        [ 1,     0,     0,     0,
          0,     1,     0,     0,
          0,     0,     1,     0,
          0,     0, -25+z,     1]);
}

function getRotateYMatrix(view_y) {
    var theta = view_y * Math.PI / 180;
    var c = Math.cos(theta), s = Math.sin(theta);

    return new Float32Array(
        [ c,   0,  -s,  0,
          0,   1,   0,  0,
          s,   0,   c,  0,
          0,   0,   0,  1]);
}

function getRotateXMatrix(view_x) {
    var theta = view_x * Math.PI / 180;
    var c = Math.cos(theta), s = Math.sin(theta);

    return new Float32Array(
        [ 1,   0,   0,   0,
          0,   c,   s,   0,
          0,  -s,   c,   0,
          0,   0,   0,   1]);
}

function frand(n) {
    return Math.random() * n;
}

function bellrand(n) {
    return (frand(n) + frand(n) + frand(n))/3;
}

function random(n) {
    return Math.floor(frand(n));
}


var GRID_SIZE = 70;
var GRID_DEPTH = 35;
var SPEED = 1;
var WAVE_SIZE = 22;
var SPLASH_RATIO = 0.7;
var STRIPS = 44;

var NICE_VIEWS = [
  [  0,     0 ],
  [  0,   -20 ],
  [  0,    20 ],
  [ 25,     0 ],
  [-25,     0 ],
  [ 25,    20 ],
  [-25,    20 ],
  [ 25,   -20 ],
  [-25,   -20 ],

  [ 10,     0 ],
  [-10,     0 ],
  [  0,     0 ],
  [  0,     0 ],
  [  0,     0 ],
  [  0,     0 ],
  [  0,     0 ]
];

var MATRIX_ENCODING = [
    16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    160, 161, 162, 163, 164, 165, 166, 167,
    168, 169, 170, 171, 172, 173, 174, 175
];

function getRandomGlyph() {
    return random(11*16-1) + 1;
}

function getDefaultGlyphs() {
    var default_glyphs = [];
    for (var i=0; i<GRID_SIZE; i++)
        default_glyphs.push(0);
    return default_glyphs;
}

function Strip(gl) {
    this.gl = gl;
    this.vertices_buffer = gl.createBuffer();
    this.texture_coord_buffer = gl.createBuffer();
    this.vertices_indices_buffer = gl.createBuffer();

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vertices_indices_buffer);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        this.makeVerticesIndices(GRID_SIZE),
        gl.STATIC_DRAW);

    this.reset(true);
}

Strip.prototype.reset = function(clear) {
    this.x = frand(GRID_SIZE) - (GRID_SIZE/2);
    this.y = (GRID_SIZE/2) + bellrand(0.5);
    this.z = (GRID_DEPTH*0.2) - frand(GRID_DEPTH*0.7);

    this.spinner_y = 0;

    this.dx = 0;
    this.dy = 0;
    this.dz = bellrand(0.02) * SPEED;

    this.spinner_speed = bellrand(0.3) * SPEED;

    this.spin_speed = bellrand(2.0/SPEED)+1;
    this.spin_tick = 0;

    this.wave_position = 0;
    this.wave_speed = bellrand(3.0/SPEED)+1;
    this.wave_tick = 0;

    this.erasing_p = false;

    this.spinner_glyph = getRandomGlyph();

    var gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices_buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        this.makeVertices(GRID_SIZE),
        gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texture_coord_buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        this.makeTextureCoordVertices(GRID_SIZE),
        gl.STATIC_DRAW);

    var glyphs = [];

    if (!clear) {
        for (var i=0; i<GRID_SIZE; i++) {
            var draw_p = random(7);
            var spin_p = draw_p && !(random(20));
            var g = (draw_p)?getRandomGlyph():0;

            if (spin_p)
                g = -g;

            glyphs.push(g);

            this.setGlyph(i, (g>0)?g:-g);
        }

    } else {
        glyphs = getDefaultGlyphs();
    }

    this.glyphs = glyphs;
};

Strip.prototype.makeVertices = function(n) {
    var vertices = new Float32Array(12*(n+1));

    for (var i=0; i<n; i++) {
        var x = this.x;
        var y = this.y - i;

        vertices.set(
            [ x,   y,   0,
              x+1, y,   0,
              x,   y+1, 0,
              x+1, y+1, 0], i*12);
    }

    var x = this.x;
    var y = this.y - this.spinner_y;

    vertices.set(
        [ x,   y,   0,
          x+1, y,   0,
          x,   y+1, 0,
          x+1, y+1, 0], n*12);

    return vertices;
};

Strip.prototype.updateSpinnerPosition = function() {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices_buffer);

    var x = this.x;
    var y = this.y - this.spinner_y;

    var vertices = new Float32Array(
        [ x,   y,   0,
          x+1, y,   0,
          x,   y+1, 0,
          x+1, y+1, 0]);

    gl.bufferSubData(gl.ARRAY_BUFFER, GRID_SIZE*48, vertices);
};

Strip.prototype.makeTextureCoordVertices = function(n) {
    var vertices = new Float32Array(8*(n+1));

    for (var i=0; i<n+1; i++)
        vertices.set(
            [ 0.0/16, 1.0/11,
              1.0/16, 1.0/11,
              0.0/16, 0.0,
              1.0/16, 0.0], i*8);

    return vertices;
};

Strip.prototype.setGlyph = function (n, glyph) {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texture_coord_buffer);

    var x = Math.floor(glyph%16);
    var y = Math.floor(glyph/16);

    var texture_coord = new Float32Array(
        [ x/16,     (y+1)/11,
          (x+1)/16, (y+1)/11,
          x/16,     y/11,
          (x+1)/16, y/11]);

    gl.bufferSubData(gl.ARRAY_BUFFER, n*32, texture_coord);
};

Strip.prototype.makeVerticesIndices = function(n) {
   var indices = new Uint16Array(6*(n+1));

    for (var i=0; i<n+1; i++)
        indices.set(
            [ i*4,   i*4+1, i*4+2,
              i*4+1, i*4+2, i*4+3], i*6);

    return indices;
};

Strip.prototype.afterTick = function () {
    var depth = (this.z/GRID_DEPTH)+0.5;
    depth = 0.2 + (depth * 0.8);

    if (this.z > GRID_DEPTH/2) {
        var ratio = ((this.z-GRID_DEPTH/2)/((GRID_DEPTH*SPLASH_RATIO)-GRID_DEPTH/2));
        var i = ratio * WAVE_SIZE;

        if (i<0) {
            i = 0;
        } else if (i>=WAVE_SIZE) {
            i=WAVE_SIZE-1;
        }

        depth *= 0.2+0.8*Math.sin((WAVE_SIZE-i)/(WAVE_SIZE-1)*Math.PI/2);
    }

    this.depth = depth;
    this.translate_matrix = getTranslateMatrix(this.z);
};

Strip.prototype.tick = function () {
    this.x += this.dx;
    this.y += this.dy;
    this.z += this.dz;

    if (this.z > GRID_DEPTH * SPLASH_RATIO) {
        this.reset();
        return this.afterTick();
    }

    this.spinner_y += this.spinner_speed;

    if (this.spinner_y >= GRID_SIZE) {
        if (this.erasing_p) {
            this.reset();
            return this.afterTick();
        } else {
            this.erasing_p = true;
            this.spinner_y = 0;
            this.spinner_speed /= 2;
            this.setGlyph(GRID_SIZE, 0);
        }
    }

    this.spin_tick++;
    if (this.spin_tick > this.spin_speed) {
        this.spin_tick = 0;
        this.spinner_glyph = getRandomGlyph();

        for (var i=0; i<GRID_SIZE; i++)
            if (this.glyphs[i] < 0) {
                var g = -getRandomGlyph();

                if (!(random(800)))
                    g = -g;

                this.glyphs[i] = g;

                this.setGlyph(i, (g>0)?g:-g);
            }
    }

    if (!(this.erasing_p))
        this.setGlyph(GRID_SIZE, this.spinner_glyph);

    this.updateSpinnerPosition();

    this.wave_tick++;

    if (this.wave_tick>this.wave_speed) {
        this.wave_tick = 0;
        this.wave_position++;

        if (this.wave_position >= WAVE_SIZE)
            this.wave_position = 0;
    }

    return this.afterTick();
};


function AutoTracking() {
    this.last = NICE_VIEWS[0];
    this.target = NICE_VIEWS[0];
    this.view_steps = 100;
    this.view_tick = 0;
}

AutoTracking.prototype.tick = function () {
    var th = Math.sin(Math.PI/2 * this.view_tick / this.view_steps);
    var view_x = this.last[0] + (this.target[0] - this.last[0]) * th;
    var view_y = this.last[1] + (this.target[1] - this.last[1]) * th;

    this.view_tick += 1;

    if (this.view_tick >= this.view_steps) {
        this.view_tick = 0;
        this.view_steps = 350.0/SPEED;
        this.last = this.target;
        this.target = NICE_VIEWS[random(NICE_VIEWS.length)];
    }

    this.rotate_x = getRotateXMatrix(view_x);
    this.rotate_y = getRotateYMatrix(view_y);
};


function mainloop(ctx) {
    var gl = ctx.gl;
    var canvas = ctx.canvas;

    var request_id = null;
    var timeout = null;
    var perspective = null;
    var focus = compatHasFocus();
    var timestamps = [compatAnimationStartTime()];

    var auto_track = new AutoTracking();
    var strips = [];

    for (var i=0; i<STRIPS; i++) {
        var strip = new Strip(gl);
        strip.erasing_p = true;
        strip.spinner_y = frand(GRID_SIZE);
        strips.push(strip);
    }

    function draw(timestamp) {
        timestamps.push(timestamp);

        while((timestamps.length > 2) && (timestamps[0] + 10000 < timestamp))
            timestamps.shift();

        document.title = Math.floor(1000*(timestamps.length-1)/(timestamp - timestamps[0])) + " FPS";

        auto_track.tick();

        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.uniform1i(ctx.sampler, 0);
        gl.uniformMatrix4fv(ctx.perspective, false, perspective);
        gl.uniformMatrix4fv(ctx.rotate_x, false, auto_track.rotate_x);
        gl.uniformMatrix4fv(ctx.rotate_y, false, auto_track.rotate_y);

        for (var i=0; i<STRIPS; i++) {
            var strip = strips[i];
            strip.tick();

            gl.uniformMatrix4fv(ctx.translate, false, strip.translate_matrix);
            gl.uniform1f(ctx.alpha, strip.depth);
            gl.uniform1f(ctx.wave, strip.wave_position);

            if (strip.erasing_p) {
                gl.uniform1f(ctx.bottom, strip.y - GRID_SIZE);
                gl.uniform1f(ctx.top, strip.y - strip.spinner_y);
            } else {
                gl.uniform1f(ctx.bottom, strip.y - strip.spinner_y + 1);
                gl.uniform1f(ctx.top, strip.y);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, strip.vertices_buffer);
            gl.vertexAttribPointer(ctx.position, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, strip.texture_coord_buffer);
            gl.vertexAttribPointer(ctx.tex_coord, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, strip.vertices_indices_buffer);
            gl.drawElements(gl.TRIANGLES, (GRID_SIZE+1)*6, gl.UNSIGNED_SHORT, 0);
        }

        if (request_id)
            request_id = compatRequestAnimationFrame(draw);
    }

    function start() {
        if (focus && !timeout)
            request_id = compatRequestAnimationFrame(draw);
    }

    function stop() {
        if (request_id) {
            if (compatCancelAnimationFrame)
                compatCancelAnimationFrame(request_id);
            request_id = null;
        }
    }

    function reset() {
        if (timeout) {
            window.clearTimeout(timeout);
            timeout = null;
        }

        gl.viewport(0,0, canvas.width, canvas.height);
        perspective = getPerspectiveMatrix(80*Math.PI/180, canvas.width/canvas.height, 1, 100);

        start();
    }

    function onWindowFocus() {
        focus = true;
        if (!request_id)
            start();
    }

    function onWindowBlur() {
        focus = false;
        stop();
    }

    function onWindowResize() {
        stop();

        if (timeout) {
            window.clearTimeout(timeout);
            timeout = null;
        }

        canvas.width = compatGetWidth();
        canvas.height = compatGetHeight();
        timeout = window.setTimeout(reset, 500);
    }

    canvas.width = compatGetWidth();
    canvas.height = compatGetHeight();
    compatAddEventListener(window, 'resize', onWindowResize);
    compatAddEventListener(window, 'focus', onWindowFocus);
    compatAddEventListener(window, 'blur', onWindowBlur);

    reset();
}


function WebGLException(description) {
    this.description = description;
};


WebGLException.prototype.toString = function () {
    return "WebGL Exception, " + this.description;
};


function bindTexture(gl, texture, elem) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, elem);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}


function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}


function linkProgram(gl, shaders) {
    var program = gl.createProgram();

    for (var i=0; i<shaders.length; i++)
        gl.attachShader(program, shaders[i]);

    gl.linkProgram(program);

    return program;
}


VERTEX_SHADER = ""
    + "attribute vec3 aPosition;"
    + "attribute vec2 aTexCoord;"
    + ""
    + "uniform mat4 uPerspective;"
    + "uniform mat4 uRotateY;"
    + "uniform mat4 uRotateX;"
    + "uniform mat4 uTranslate;"
    + ""
    + "uniform float uAlpha;"
    + "uniform float uWave;"
    + "uniform float uBottom;"
    + "uniform float uTop;"
    + ""
    + "varying mediump vec2 vTexCoord;"
    + "varying float vAlpha;"
    + ""
    + "void main(void) {"
    + "  gl_Position = uPerspective*uRotateY*uRotateX*uTranslate*vec4(aPosition, 1.0);"
    + "  vTexCoord = aTexCoord;"
    + "  float j = floor(mod((aPosition.y+(70.0+uWave)), 22.0));"
    + "  vAlpha = uAlpha*(0.2+0.8*sin(j/21.0*3.1416/2.0))*step(uBottom, aPosition.y)*step(aPosition.y, uTop);"
    + "}";


FRAGMENT_SHADER = ""
    + "precision mediump float;"
    + "varying mediump vec2 vTexCoord;"
    + "varying float vAlpha;"
    + ""
    + "uniform sampler2D uSampler;"
    + ""
    + "void main(void) {"
    + "  vec4 textureColor = texture2D(uSampler, vTexCoord);"
    + "  gl_FragColor = vec4(textureColor.rgb, textureColor.a * vAlpha);"
    + "}";


function WebGLMatrix(canvas){
    var ctx = new Object();

    var gl = compatGetGLContext(canvas);

    if (!gl)
        throw new WebGLException("Cannot get WebGL context!");

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.enable(gl.BLEND);

    var vertex_shader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);

    if (!gl.getShaderParameter(vertex_shader, gl.COMPILE_STATUS))
        throw new WebGLException(
            "An error occurred compiling the vertex shader: "
                + gl.getShaderInfoLog(vertex_shader));

    var fragment_shader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!gl.getShaderParameter(fragment_shader, gl.COMPILE_STATUS))
        throw new WebGLException(
            "An error occurred compiling the fragment shader: "
                + gl.getShaderInfoLog(fragment_shader));

    var program = linkProgram(gl, [vertex_shader, fragment_shader]);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new WebGLException(
            "Unable to link the shader program.");

    gl.useProgram(program);

    ctx.canvas = canvas;
    ctx.gl = gl;

    ctx.position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(ctx.position);

    ctx.texcoord = gl.getAttribLocation(program, "aTexCoord");
    gl.enableVertexAttribArray(ctx.texcoord);

    ctx.sampler = gl.getUniformLocation(program, "uSampler");
    ctx.alpha = gl.getUniformLocation(program, "uAlpha");
    ctx.wave = gl.getUniformLocation(program, "uWave");

    ctx.bottom = gl.getUniformLocation(program, "uBottom");
    ctx.top = gl.getUniformLocation(program, "uTop");

    ctx.perspective = gl.getUniformLocation(program, "uPerspective");
    ctx.rotate_x = gl.getUniformLocation(program, "uRotateX");
    ctx.rotate_y = gl.getUniformLocation(program, "uRotateY");
    ctx.translate = gl.getUniformLocation(program, "uTranslate");

    var image = new Image();

    ctx.texture = gl.createTexture();

    compatAddEventListener(
        image, 'load',
        function() {
            bindTexture(gl, ctx.texture, image);
            mainloop(ctx);
        });

    image.crossOrigin = "Anonymous";
    image.src = "webglmatrix.png";
}

compatAddEventListener(
    window, 'load',
    function() {
        WebGLMatrix(
            document.getElementById("glcanvas"));
    });
