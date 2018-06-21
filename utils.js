"use strict";

function* range(n) {
    for(let i=0; i<n; i++)
        yield i;
}

function *frames() {
    while(true)
        yield new Promise((resolve,reject) => requestAnimationFrame(resolve));
}

function glutils(gl) {
    if (!gl)
        throw "Unable to initialize WebGL";

    function init_texture(n, default_color) {
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + n);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(default_color));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        return texture;
    }

    const VERTEX_SHADER = `mat4
translate(vec3 v) {
  return mat4(
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    v.x, v.y, v.z, 1.0);
}

mat4
translate(float x, float y, float z) {
  return translate(vec3(x, y, z));
}

mat4
rotate(float rad, vec3 axis) {
  vec3 a = normalize(axis);
  float s = sin(rad);
  float c = cos(rad);

  return mat4(outerProduct(a,a) * (1.0-c) +
    mat3(     c,  a.z*s, -a.y*s,
         -a.z*s,      c,  a.x*s,
          a.y*s, -a.x*s,      c));
}

mat4
perspective(float fovy, float aspect, float near, float far) {
  float f = 1.0/tan(fovy/2.0);
  float dz = near - far;
  return mat4(
    f/aspect, 0.0, 0.0,               0.0,
    0.0,      f,   0.0,               0.0,
    0.0,      0.0, (far+near)/dz,    -1.0,
    0.0,      0.0, (far*near*2.0)/dz, 0.0);
}

mat4
lookat(vec3 eye, vec3 center, vec3 up) {
  vec3 f=normalize(center-eye);
  vec3 s=cross(f,normalize(up));
  vec3 u=cross(normalize(s),f);
  return translate(-eye) * mat4(transpose(mat3(s,u,-f)));
}`;

    const FRAGMENT_SHADER = `precision mediump float;`;

    const ATTRIB_SIZE = {
        [gl.FLOAT]:      1,
        [gl.FLOAT_VEC2]: 2,
        [gl.FLOAT_VEC3]: 3,
    };

    const ATTRIB_TYPE = {
        Uint8Array:   gl.UNSIGNED_BYTE,
        Uint16Array:  gl.UNSIGNED_SHORT,
        Float32Array: gl.FLOAT,
    };

    const UNIFORM = {
        [gl.INT] :       (loc) => (value) => gl.uniform1iv(loc, value),
        [gl.FLOAT]:      (loc) => (value) => gl.uniform1f(loc, value),
        [gl.FLOAT_VEC2]: (loc) => (value) => gl.uniform2fv(loc, value),
        [gl.FLOAT_VEC3]: (loc) => (value) => gl.uniform3fv(loc, value),
        [gl.SAMPLER_2D]: (loc) => (value) => gl.uniform1i(loc, value),
    };

    const make_attrib = (index, size) =>
          function (buffer, instances) {
              buffer.update(gl.STATIC_DRAW);
              gl.vertexAttribPointer(index, size, ATTRIB_TYPE[buffer.data.constructor.name], false, 0, 0);
              if (instances)
                  gl.vertexAttribDivisor(index, instances*size/buffer.data.length);
          };

    function load_program(shaders) {
        const attrib = {}, uniform = {};
        const program = gl.createProgram();

        for (let [k,v] of Object.entries(shaders)) {
            const s = gl.createShader(gl[k]);
            gl.shaderSource(s, "#version 300 es\n" + {VERTEX_SHADER, FRAGMENT_SHADER}[k] + v);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                throw "An error occurred compiling shader: "+ gl.getShaderInfoLog(s);
            gl.attachShader(program, s);
        }

        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            throw "Unable to link program: " + gl.getProgramInfoLog(program);
        gl.useProgram(program);

        for(let i of range(gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES))) {
            const {name, type} = gl.getActiveAttrib(program, i);
            if (name.startsWith("gl_"))
                continue;
            const location = gl.getAttribLocation(program, name);
            gl.enableVertexAttribArray(location);
            attrib[name] = make_attrib(location, ATTRIB_SIZE[type]);
        }

        for(let i of range(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS))) {
            const {name, type} = gl.getActiveUniform(program, i);
            uniform[name.split('[',1)[0]] = UNIFORM[type](gl.getUniformLocation(program, name));
        }

        return {attrib, uniform};
    }

    class Buffer {
        constructor(type, data) {
            this.buffer = gl.createBuffer();
            this.type = type;
            this.data = data;
        }

        update(usage) {
            gl.bindBuffer(this.type, this.buffer);
            gl.bufferData(this.type, this.data, usage);
        }
    }

    return {load_program, init_texture, Buffer};
}
