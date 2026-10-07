/* ObsidianUI Art Gallery, native WebGL port of the official MIT component.
   Copyright (c) 2026 ObsidianUI. See THIRD-PARTY-NOTICES.txt.
   Upstream fragment shader retained with monochrome output; framework lifecycle,
   bounded atlases, keyboard/touch/failure handling and on-demand rendering are ours. */
const vertexShader = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;
const fragmentShader = `
  uniform vec2 uOffset;
  uniform vec2 uResolution;
  uniform vec4 uBorderColor;
  uniform vec4 uHoverColor;
  uniform vec4 uBackgroundColor;
  uniform vec2 uMousePos;
  uniform float uZoom;
  uniform float uCellSize;
  uniform float uTextureCount;
  uniform sampler2D uImageAtlas;
  uniform sampler2D uTextAtlas;
  varying vec2 vUv;

  void main() {
    vec2 screenUV = (vUv - 0.5) * 2.0;
    float radius = length(screenUV);
    float distortion = 1.0 - 0.08 * radius * radius;
    vec2 distortedUV = screenUV * distortion;
    vec2 aspectRatio = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 worldCoord = distortedUV * aspectRatio;
    worldCoord *= uZoom;
    worldCoord += uOffset;
    vec2 cellPos = worldCoord / uCellSize;
    vec2 cellId = floor(cellPos);
    vec2 cellUV = fract(cellPos);
    vec2 mouseScreenUV = (uMousePos / uResolution) * 2.0 - 1.0;
    mouseScreenUV.y = -mouseScreenUV.y;
    float mouseRadius = length(mouseScreenUV);
    float mouseDistortion = 1.0 - 0.08 * mouseRadius * mouseRadius;
    vec2 mouseDistortedUV = mouseScreenUV * mouseDistortion;
    vec2 mouseWorldCoord = mouseDistortedUV * aspectRatio;
    mouseWorldCoord *= uZoom;
    mouseWorldCoord += uOffset;
    vec2 mouseCellPos = mouseWorldCoord / uCellSize;
    vec2 mouseCellId = floor(mouseCellPos);
    vec2 cellCenter = cellId + 0.5;
    vec2 mouseCellCenter = mouseCellId + 0.5;
    float cellDistance = length(cellCenter - mouseCellCenter);
    float hoverIntensity = 1.0 - smoothstep(0.4, 0.7, cellDistance);
    bool isHovered = hoverIntensity > 0.0 && uMousePos.x >= 0.0;
    vec3 backgroundColor = uBackgroundColor.rgb;
    if (isHovered) {
      backgroundColor = mix(uBackgroundColor.rgb, uHoverColor.rgb, hoverIntensity * uHoverColor.a);
    }
    float lineWidth = 0.005;
    float gridX = smoothstep(0.0, lineWidth, cellUV.x) * smoothstep(0.0, lineWidth, 1.0 - cellUV.x);
    float gridY = smoothstep(0.0, lineWidth, cellUV.y) * smoothstep(0.0, lineWidth, 1.0 - cellUV.y);
    float gridMask = gridX * gridY;
    float imageSize = 0.6;
    float imageBorder = (1.0 - imageSize) * 0.5;
    vec2 imageUV = (cellUV - imageBorder) / imageSize;
    float edgeSmooth = 0.01;
    vec2 imageMask = smoothstep(-edgeSmooth, edgeSmooth, imageUV) *
                    smoothstep(-edgeSmooth, edgeSmooth, 1.0 - imageUV);
    float imageAlpha = imageMask.x * imageMask.y;
    bool inImageArea = imageUV.x >= 0.0 && imageUV.x <= 1.0 && imageUV.y >= 0.0 && imageUV.y <= 1.0;
    float textHeight = 0.08;
    float textY = 0.88;
    bool inTextArea = cellUV.x >= 0.05 && cellUV.x <= 0.95 && cellUV.y >= textY && cellUV.y <= (textY + textHeight);
    float texIndex = mod(cellId.x + cellId.y * 3.0, uTextureCount);
    vec3 color = backgroundColor;
    if (inImageArea && imageAlpha > 0.0) {
      float atlasSize = ceil(sqrt(uTextureCount));
      vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
      // Flip within the selected tile, not the entire atlas (which swaps rows).
      vec2 atlasUV = (atlasPos + vec2(imageUV.x, 1.0 - imageUV.y)) / atlasSize;
      vec3 sourceColor = texture2D(uImageAtlas, atlasUV).rgb;
      vec3 imageColor = vec3(dot(sourceColor, vec3(0.299, 0.587, 0.114)));
      color = mix(color, imageColor, imageAlpha);
    }
    if (inTextArea) {
      vec2 textCoord = vec2((cellUV.x - 0.05) / 0.9, (cellUV.y - textY) / textHeight);
      textCoord.y = 1.0 - textCoord.y;
      float atlasSize = ceil(sqrt(uTextureCount));
      vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
      vec2 atlasUV = (atlasPos + textCoord) / atlasSize;
      vec4 textColor = texture2D(uTextAtlas, atlasUV);
      color = mix(backgroundColor, textColor.rgb, textColor.a);
    }
    vec3 borderRGB = uBorderColor.rgb;
    float borderAlpha = uBorderColor.a;
    color = mix(color, borderRGB, (1.0 - gridMask) * borderAlpha);
    float fade = 1.0 - smoothstep(1.2, 1.8, radius);
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;

export async function mountArtGallery(container, sourceImages, onFailure) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) throw new Error('WebGL unavailable');
  let disposed = false;
  let frame = 0;
  let visible = true;
  let dragging = null;
  const cleanups = [];
  const shaders = [];
  const textures = [];
  let program;
  let buffer;
  const state = { x: 0, y: 0, tx: 0, ty: 0, zoom: 1, targetZoom: 1 };
  const listen = (target, type, listener, options) => {
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (dragging && container.hasPointerCapture(dragging.id))
      container.releasePointerCapture(dragging.id);
    dragging = null;
    container.classList.remove('is-dragging');
    cancelAnimationFrame(frame);
    for (const cleanup of cleanups) cleanup();
    for (const texture of textures) gl.deleteTexture(texture);
    for (const shader of shaders) gl.deleteShader(shader);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    canvas.remove();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  try {
    function compile(type, source) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader unavailable');
      return shader;
    }
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
    gl.attachShader(
      program,
      compile(gl.FRAGMENT_SHADER, 'precision mediump float;\n' + fragmentShader),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Gallery unavailable');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name) => gl.getUniformLocation(program, name);
    await document.fonts.ready;
    const dimension = Math.ceil(Math.sqrt(sourceImages.length));
    const tileSize = 512;
    const atlas = document.createElement('canvas');
    atlas.width = atlas.height = dimension * tileSize;
    const ctx = atlas.getContext('2d');
    const textAtlas = document.createElement('canvas');
    textAtlas.width = textAtlas.height = dimension * tileSize;
    const text = textAtlas.getContext('2d');
    if (!ctx || !text) throw new Error('Canvas unavailable');
    function wrap(value, x, y, width, lineHeight) {
      let line = '';
      for (const word of value.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > width && line) {
          ctx.fillText(line, x, y);
          line = word;
          y += lineHeight;
        } else line = next;
      }
      ctx.fillText(line, x, y);
      return y + lineHeight;
    }
    for (const [index, source] of sourceImages.entries()) {
      const x = (index % dimension) * tileSize;
      const y = Math.floor(index / dimension) * tileSize;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#1b1a18';
      ctx.fillRect(0, 0, tileSize, tileSize);
      const photo = source.querySelector('img');
      if (photo) {
        const img = new Image();
        img.src = photo.currentSrc || photo.src;
        await img.decode();
        // Match the static CSS viewport for source screenshots. This is display-only;
        // original image bytes remain intact. Other photos retain their branding strips.
        const crop = source
          .querySelector('[data-source-crop]')
          ?.dataset.sourceCrop.split(',')
          .map(Number) || [0, 0, img.width, img.height];
        const [sx, sy, sw, sh] = crop;
        const scale = Math.min(tileSize / sw, tileSize / sh);
        const width = sw * scale;
        const height = sh * scale;
        ctx.drawImage(
          img,
          sx,
          sy,
          sw,
          sh,
          (tileSize - width) / 2,
          (tileSize - height) / 2,
          width,
          height,
        );
      } else {
        ctx.fillStyle = '#f4efe3';
        ctx.font = '20px Barlow, sans-serif';
        ctx.fillText('GOOGLE MAPS · 5/5', 34, 48);
        ctx.font = '52px "Barlow Condensed", sans-serif';
        wrap(source.querySelector('blockquote').textContent.trim(), 34, 120, 440, 58);
        ctx.font = '28px Barlow, sans-serif';
        const end = wrap(source.querySelector('.review-author').textContent, 34, 330, 440, 32);
        ctx.font = '22px Barlow, sans-serif';
        wrap(source.querySelector('.review-date').textContent, 34, end + 20, 440, 24);
      }
      ctx.restore();
      text.save();
      text.translate(x, y);
      text.scale(1, 8);
      text.font = '22px monospace';
      text.textBaseline = 'middle';
      text.fillStyle = '#bdb9af';
      text.fillText(source.dataset.label, 12, 32);
      text.restore();
    }
    function texture(source, unit, name) {
      const item = gl.createTexture();
      textures.push(item);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, item);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1i(uniform(name), unit);
    }
    texture(atlas, 0, 'uImageAtlas');
    texture(textAtlas, 1, 'uTextAtlas');
    gl.uniform4f(uniform('uBorderColor'), 0.96, 0.94, 0.89, 0.15);
    gl.uniform4f(uniform('uHoverColor'), 0, 0, 0, 0);
    gl.uniform4f(uniform('uBackgroundColor'), 0.067, 0.067, 0.063, 1);
    gl.uniform2f(uniform('uMousePos'), -1, -1);
    gl.uniform1f(uniform('uTextureCount'), sourceImages.length);
    gl.uniform1f(uniform('uCellSize'), 1.5);
    canvas.setAttribute('aria-hidden', 'true');
    container.append(canvas);
    const offset = uniform('uOffset');
    const zoom = uniform('uZoom');
    function render() {
      frame = 0;
      if (disposed || !visible || document.hidden) return;
      state.x += (state.tx - state.x) * 0.15;
      state.y += (state.ty - state.y) * 0.15;
      state.zoom += (state.targetZoom - state.zoom) * 0.15;
      gl.uniform2f(offset, state.x, state.y);
      gl.uniform1f(zoom, state.zoom);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (
        Math.abs(state.tx - state.x) +
          Math.abs(state.ty - state.y) +
          Math.abs(state.targetZoom - state.zoom) >
        0.0001
      )
        schedule();
    }
    function schedule() {
      if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(render);
    }
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniform('uResolution'), width, height);
      schedule();
    });
    resize.observe(container);
    cleanups.push(() => resize.disconnect());
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    visibility.observe(container);
    cleanups.push(() => visibility.disconnect());
    listen(document, 'visibilitychange', schedule);
    listen(container, 'pointerdown', (event) => {
      if (event.button !== 0 || dragging !== null) return;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
      container.setPointerCapture(event.pointerId);
      container.classList.add('is-dragging');
      container.focus({ preventScroll: true });
    });
    listen(container, 'pointermove', (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      state.tx -= (event.clientX - dragging.x) * 0.003;
      if (event.pointerType !== 'touch') state.ty += (event.clientY - dragging.y) * 0.003;
      state.targetZoom = 1.15;
      dragging.x = event.clientX;
      dragging.y = event.clientY;
      schedule();
    });
    function endDrag(event) {
      if (!dragging || dragging.id !== event.pointerId) return;
      dragging = null;
      container.classList.remove('is-dragging');
      if (container.hasPointerCapture(event.pointerId))
        container.releasePointerCapture(event.pointerId);
      state.targetZoom = 1;
      schedule();
    }
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      listen(container, event, endDrag);
    function pan(dx, dy) {
      state.tx += dx;
      state.ty += dy;
      schedule();
    }
    function reset() {
      state.tx = state.ty = 0;
      state.targetZoom = 1;
      schedule();
    }
    listen(container, 'keydown', (event) => {
      const moves = {
        ArrowLeft: [-0.4, 0],
        ArrowRight: [0.4, 0],
        ArrowUp: [0, 0.4],
        ArrowDown: [0, -0.4],
      };
      if (moves[event.key]) {
        event.preventDefault();
        pan(...moves[event.key]);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        reset();
      }
    });
    listen(canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      dispose();
      onFailure();
    });
    schedule();
    return { dispose, pan, reset };
  } catch (error) {
    dispose();
    throw error;
  }
}
